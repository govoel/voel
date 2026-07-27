import { Effect, Option, Queue, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { AccountRole } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/registry.ts';

export const accountsAtom = AppRuntime.atom(
  Effect.service(MainDatabase).pipe(
    Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll())),
    Reactivity.stream(['account'])
  )
);

export const activeAccountAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
);

export const activeAccountSessionAtom = AppRuntime.atom((get) => {
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
          Option.Option<Parameters<Parameters<typeof state.authClient.useSession.subscribe>[0]>[0]>
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

export const activeUserProfileAtom = activeAccountSessionAtom.pipe(
  Atom.map((result) =>
    AsyncResult.flatMap(
      // oxlint-disable-next-line unicorn/no-array-method-this-argument
      result,
      Option.match({
        onNone: () => AsyncResult.success(Option.none()),
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

export const signInAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.signInAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.signInAccount(input)))
);

export const setupServerWithAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setupServerWithAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.setupServerWithAccount(input)))
);

export const updateCurrentUserAtom = AppRuntime.fn(
  (input: Parameters<typeof CurrentAuthClient.Service.updateUser>[0]) =>
    CurrentAuthClient.pipe(Effect.flatMap((authClient) => authClient.updateUser(input)))
);

export const accountsSheetAtom = AppRuntime.atom(
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

export const setActiveAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setActiveAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.setActiveAccount(input)))
);

export const removeAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.removeAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.removeAccount(input)))
);
