import { Effect, Option, Queue, Schema, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AppRuntime } from '#src/services/registry.ts';

export const accountsAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
);

export const activeAccountServerUrlAtom = accountsAtom.pipe(
  Atom.mapResult((accounts) =>
    accounts.activeAccount.pipe(Option.map(({ account }) => account.serverUrl))
  )
);

export const activeAccountAuthClientAtom = accountsAtom.pipe(
  Atom.mapResult((accounts) =>
    accounts.activeAccount.pipe(Option.map(({ state }) => state.authClient))
  )
);

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

export const listAccountsAtom = AppRuntime.pull(
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
).pipe(
  Atom.withReactivity(['accounts']),
  Atom.swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true })
);

export const activeAccountSessionAtom = AppRuntime.atom((get) => {
  const accounts = get.streamResult(accountsAtom);

  const changes = Stream.changesWith(accounts, (previous, next) =>
    Option.match(previous.activeAccount, {
      onNone: () => Option.isNone(next.activeAccount),
      onSome: (previousActiveAccount) =>
        Option.match(next.activeAccount, {
          onNone: () => false,
          onSome: (nextActiveAccount) =>
            previousActiveAccount.state.authClient === nextActiveAccount.state.authClient,
        }),
    })
  );

  return Stream.switchMap(changes, ({ activeAccount }) =>
    Option.match(activeAccount, {
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

type ActiveAccountSession = Atom.Success<typeof activeAccountSessionAtom>;

export const upsertAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.upsertAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.upsertAccount(input)))
);

const getAccountsSheet = ({
  accounts,
  activeAccountSession,
}: {
  readonly accounts: Atom.Success<typeof accountsAtom>;
  readonly activeAccountSession: ActiveAccountSession;
}) => {
  if (accounts.accounts.length === 0) {
    return { mode: 'ONBOARDING', dismissable: false } as const;
  }

  if (Option.isNone(accounts.activeAccount)) {
    return { mode: 'MUST_PICK_ACCOUNT', dismissable: false } as const;
  }

  if (
    Option.isNone(activeAccountSession) ||
    activeAccountSession.value.error !== null ||
    activeAccountSession.value.data === null
  ) {
    return { mode: 'INVALID_SESSION', dismissable: true } as const;
  }

  return { mode: 'IDLE', dismissable: true } as const;
};

export const accountsSheetAtom = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const accounts = yield* get.result(accountsAtom);
    const activeAccountSession = yield* get.result(activeAccountSessionAtom);

    return getAccountsSheet({ accounts, activeAccountSession });
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
