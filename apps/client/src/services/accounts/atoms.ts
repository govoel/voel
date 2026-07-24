import { Effect, Option, Queue, Schema, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { AccountRole } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/registry.ts';

export class ListAccountsNoAuthClientError extends Schema.TaggedErrorClass<
  ListAccountsNoAuthClientError,
  { readonly brand: unique symbol }
>()('voel/app/accounts/server/accounts/ListAccountsNoAuthClientError', {}) {}

export const makeAccountsAtoms = (
  runtime: Atom.AtomRuntime<AccountManager | CurrentAuthClient | MainDatabase>
) => {
  const accountsAtom = runtime.atom(
    Effect.service(MainDatabase).pipe(
      Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll())),
      Reactivity.stream(['account'])
    )
  );

  const activeAccountAtom = runtime.atom(
    AccountManager.pipe(
      Effect.map((manager) => manager.changes),
      Stream.unwrap
    )
  );

  const activeAccountServerUrlAtom = activeAccountAtom.pipe(
    Atom.mapResult((accounts) => accounts.pipe(Option.map(({ account }) => account.serverUrl)))
  );

  const activeAccountAuthClientAtom = activeAccountAtom.pipe(
    Atom.mapResult((accounts) => accounts.pipe(Option.map(({ state }) => state.authClient)))
  );

  const listAccountsAtom = runtime
    .pull(
      Effect.fnUntraced(
        function* (get) {
          const authClient = yield* get.result(activeAccountAuthClientAtom);

          if (Option.isNone(authClient)) {
            return yield* new ListAccountsNoAuthClientError();
          }

          const currentAuthClient = yield* CurrentAuthClient;
          return Stream.paginate(
            0,
            Effect.fnUntraced(function* (offset) {
              const data = yield* currentAuthClient.listUsers({
                query: {
                  limit: 10,
                  offset,
                },
              });

              const nextOffset = offset + data.users.length;
              const hasMore = data.users.length > 0 && nextOffset < data.total;

              return [data.users, hasMore ? Option.some(nextOffset) : Option.none()] as const;
            })
          );
        },
        (effect) => Stream.unwrap(effect)
      )
    )
    .pipe(Atom.swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true }));

  const activeAccountSessionAtom = runtime.atom((get) => {
    const activeAccount = get.streamResult(activeAccountAtom);

    const changes = Stream.changesWith(activeAccount, (previous, next) =>
      Option.match(previous, {
        onNone: () => Option.isNone(next),
        onSome: (previousActiveAccount) =>
          Option.match(next, {
            onNone: () => false,
            onSome: (nextActiveAccount) =>
              previousActiveAccount.state.authClient === nextActiveAccount.state.authClient,
          }),
      })
    );

    return Stream.switchMap(changes, (newActiveAccount) =>
      Option.match(newActiveAccount, {
        onNone: () => Stream.make(Option.none()),
        onSome: ({ state }) =>
          Stream.callback<
            Option.Option<
              Parameters<Parameters<typeof state.authClient.useSession.subscribe>[0]>[0]
            >
          >(
            Effect.fnUntraced(function* (queue) {
              const unsubscribe = yield* Effect.sync(() =>
                state.authClient.useSession.subscribe((session) => {
                  Queue.offerUnsafe(queue, Option.some(session));
                })
              );

              yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
            })
          ),
      })
    );
  });

  const activeUserProfileAtom = activeAccountSessionAtom.pipe(
    Atom.map((result) =>
      // oxlint-disable-next-line unicorn/no-array-method-this-argument -- This is Effect's dual API, not Array.prototype.flatMap.
      AsyncResult.flatMap(result, (activeAccountSession) =>
        Option.match(activeAccountSession, {
          onNone: () => AsyncResult.success(Option.none<ActiveUserProfile>()),
          onSome: (sessionState) => {
            if (sessionState.data === null) {
              return sessionState.isPending
                ? AsyncResult.initial(true)
                : AsyncResult.fail('ActiveUserProfileUnavailable' as const);
            }

            const { user } = sessionState.data;
            if (user.username === null || user.username === void 0) {
              return AsyncResult.fail('ActiveUserProfileUnavailable' as const);
            }

            return AsyncResult.success(
              Option.some({
                email: user.email,
                id: user.id,
                name: user.name,
                role: AccountRole.formatFromNullishString(user.role),
                username: user.username,
              }),
              { waiting: sessionState.isPending || sessionState.isRefetching }
            );
          },
        })
      )
    )
  );

  const signInAccountAtom = runtime.fn(
    (input: Parameters<typeof AccountManager.Service.signInAccount>[0]) =>
      AccountManager.pipe(Effect.flatMap((manager) => manager.signInAccount(input)))
  );

  const accountsSheetAtom = runtime.atom(
    Effect.fnUntraced(function* (get) {
      const accounts = yield* get.result(accountsAtom);

      if (accounts.length === 0) {
        return { mode: 'ONBOARDING', dismissable: false } as const;
      }

      const activeAccount = yield* get.result(activeAccountAtom);
      if (Option.isNone(activeAccount)) {
        return { mode: 'MUST_PICK_ACCOUNT', dismissable: false } as const;
      }

      const activeAccountSession = yield* get.result(activeAccountSessionAtom);
      if (
        Option.isSome(activeAccountSession) &&
        !activeAccountSession.value.isPending /* nothing in-flight while there is no session */ &&
        activeAccountSession.value.error === null /* no error hitting the server */ &&
        activeAccountSession.value.data === null /* no session of any kind */
      ) {
        return { mode: 'INVALID_SESSION', dismissable: true } as const;
      }

      return { mode: 'IDLE', dismissable: true } as const;
    })
  );

  const setActiveAccountAtom = runtime.fn(
    (input: Parameters<typeof AccountManager.Service.setActiveAccount>[0]) =>
      AccountManager.pipe(Effect.flatMap((manager) => manager.setActiveAccount(input)))
  );

  const removeAccountAtom = runtime.fn(
    (input: Parameters<typeof AccountManager.Service.removeAccount>[0]) =>
      AccountManager.pipe(Effect.flatMap((manager) => manager.removeAccount(input)))
  );

  return {
    accountsAtom,
    activeAccountAtom,
    activeAccountServerUrlAtom,
    activeAccountAuthClientAtom,
    activeUserProfileAtom,
    listAccountsAtom,
    activeAccountSessionAtom,
    signInAccountAtom,
    accountsSheetAtom,
    setActiveAccountAtom,
    removeAccountAtom,
  };
};

export const {
  accountsAtom,
  activeAccountAtom,
  activeAccountServerUrlAtom,
  activeAccountAuthClientAtom,
  activeUserProfileAtom,
  listAccountsAtom,
  activeAccountSessionAtom,
  signInAccountAtom,
  accountsSheetAtom,
  setActiveAccountAtom,
  removeAccountAtom,
} = makeAccountsAtoms(AppRuntime);

export interface ActiveUserProfile {
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly username: string;
}
