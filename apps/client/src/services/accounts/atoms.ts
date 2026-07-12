import { Effect, Option, Queue, Schema, Stream } from 'effect';
import { Atom, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { AppRuntime } from '#src/services/registry.ts';

class BetterAuthListUsersUnknownError extends Schema.TaggedErrorClass<
  BetterAuthListUsersUnknownError,
  { readonly brand: unique symbol }
>()('voel/app/accounts/server/accounts/BetterAuthListUsersUnknownError', {}) {}

class BetterAuthListUsersKnownError extends Schema.TaggedErrorClass<
  BetterAuthListUsersKnownError,
  { readonly brand: unique symbol }
>()('voel/app/accounts/server/accounts/BetterAuthListUsersKnownError', {
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.Number,
  statusText: Schema.String,
}) {}

export class ListAccountsNoAuthClientError extends Schema.TaggedErrorClass<
  ListAccountsNoAuthClientError,
  { readonly brand: unique symbol }
>()('voel/app/accounts/server/accounts/ListAccountsNoAuthClientError', {}) {}

export const makeAccountsAtoms = (runtime: Atom.AtomRuntime<AccountManager | MainDatabase>) => {
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

          return Stream.paginate(
            0,
            Effect.fnUntraced(function* (offset) {
              const { data, error } = yield* Effect.tryPromise({
                try: async () =>
                  authClient.value.admin.listUsers({
                    query: {
                      limit: 10,
                      offset,
                    },
                  }),
                catch: () => new BetterAuthListUsersUnknownError(),
              });

              if (error !== null) {
                return yield* new BetterAuthListUsersKnownError(error);
              }

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

  const upsertAccountAtom = runtime.fn(
    (input: Parameters<typeof AccountManager.Service.upsertAccount>[0]) =>
      AccountManager.pipe(Effect.flatMap((manager) => manager.upsertAccount(input)))
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
    listAccountsAtom,
    activeAccountSessionAtom,
    upsertAccountAtom,
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
  listAccountsAtom,
  activeAccountSessionAtom,
  upsertAccountAtom,
  accountsSheetAtom,
  setActiveAccountAtom,
  removeAccountAtom,
} = makeAccountsAtoms(AppRuntime);
