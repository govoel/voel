import { expoClient } from '@better-auth/expo/client';
import type { Stream } from 'effect';
import {
  Context,
  Effect,
  Equal,
  Exit,
  Hash,
  Layer,
  Option,
  Schema,
  Scope,
  SubscriptionRef,
} from 'effect';
import * as SecureStore from 'expo-secure-store';

import { createAuthClient } from '@repo/auth-api/client.ts';

import * as ServerUrl from '#src/services/server-url.ts';

const STORAGE_KEY = 'voel_accounts';

const AccountId = Schema.String.pipe(Schema.brand('AccountId'));
type AccountId = typeof AccountId.Type;

const AccountUserId = Schema.String.pipe(Schema.brand('AccountUserId'));
type AccountUserId = typeof AccountUserId.Type;

export const AccountUsername = Schema.String.pipe(Schema.brand('AccountUsername'));
export type AccountUsername = typeof AccountUsername.Type;

const AccountDisplayName = Schema.String.pipe(Schema.brand('AccountDisplayName'));
type AccountDisplayName = typeof AccountDisplayName.Type;

class Account
  extends Schema.Class<Account>('voel/services/accounts/Account')({
    id: AccountId,
    serverUrl: ServerUrl.ServerUrl,
    userId: AccountUserId,
    username: AccountUsername,
    displayName: AccountDisplayName,
  })
  implements Equal.Equal
{
  public [Equal.symbol](that: Equal.Equal): boolean {
    return (
      that instanceof Account &&
      this.id === that.id &&
      ServerUrl.encode(this.serverUrl) === ServerUrl.encode(that.serverUrl) &&
      this.username === that.username
    );
  }

  public [Hash.symbol](): number {
    return Hash.hash([this.id, ServerUrl.encode(this.serverUrl), this.username]);
  }
}

const AccountState = Schema.Struct({
  activeAccount: Schema.OptionFromNullOr(Account),
  accounts: Schema.Array(Account),
});
type AccountState = typeof AccountState.Type;

class AccountStorageError extends Schema.TaggedErrorClass<AccountStorageError>()(
  'voel/services/accounts/AccountStorageError',
  {
    operation: Schema.Union([Schema.Literal('load'), Schema.Literal('save')]),
    cause: Schema.Defect,
  }
) {}

class AccountStateDecodeError extends Schema.TaggedErrorClass<AccountStateDecodeError>()(
  'voel/services/accounts/AccountStateDecodeError',
  {
    cause: Schema.Defect,
  }
) {}

const AccountStateString = Schema.fromJsonString(AccountState);
const decodeAccountId = Schema.decodeUnknownSync(AccountId);
const decodeAccountStateString = Schema.decodeUnknownEffect(AccountStateString);
const encodeAccountStateString = Schema.encodeSync(AccountStateString);

const makeAccountId = ({
  serverUrl,
  userId,
}: {
  readonly serverUrl: ServerUrl.ServerUrl;
  readonly userId: AccountUserId;
}) => decodeAccountId(`${ServerUrl.key(serverUrl)}_${userId}`);

const emptyAccountState = () => ({
  activeAccount: Option.none(),
  accounts: [],
});

const readStoredAccountState = Effect.fn('Accounts.readStoredAccountState')(function* () {
  const raw = yield* Effect.try({
    try: () => SecureStore.getItem(STORAGE_KEY),
    catch: (cause) => new AccountStorageError({ operation: 'load', cause }),
  });

  if (raw === null || raw === '') {
    return emptyAccountState();
  }

  return yield* decodeAccountStateString(raw).pipe(
    Effect.mapError((cause) => new AccountStateDecodeError({ cause }))
  );
});

const writeStoredAccountState = Effect.fn('Accounts.writeStoredAccountState')(function* (
  state: AccountState
) {
  const encoded = encodeAccountStateString(state);

  yield* Effect.try({
    try: () => {
      SecureStore.setItem(STORAGE_KEY, encoded);
    },
    catch: (cause) => new AccountStorageError({ operation: 'save', cause }),
  });
});

export const makeAuthStoragePrefix = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: ServerUrl.ServerUrl;
  readonly username: AccountUsername;
}) => `voel_${ServerUrl.key(serverUrl)}_${username.trim().toLowerCase()}`;

interface AccountInput {
  readonly serverUrl: ServerUrl.ServerUrl;
  readonly userId: AccountUserId;
  readonly username: AccountUsername;
  readonly displayName: AccountDisplayName;
}

const makeAccountAuthClient = (account: Account) =>
  createAuthClient({
    baseURL: ServerUrl.encode(account.serverUrl),
    plugins: [
      expoClient({
        storage: SecureStore,
        cookiePrefix: 'auth',
        storagePrefix: makeAuthStoragePrefix({
          serverUrl: account.serverUrl,
          username: account.username,
        }),
      }),
    ],
    sessionOptions: {
      refetchInterval: 4 * 60,
      refetchOnWindowFocus: true,
    },
  });

type AccountAuthClient = ReturnType<typeof makeAccountAuthClient>;

interface ActiveAccountState {
  readonly authClient: AccountAuthClient;
  readonly scope: Scope.Closeable;
}

interface MountedActiveAccount {
  readonly data: Account;
  readonly state: ActiveAccountState;
}

interface MountedAccountState {
  readonly activeAccount: Option.Option<MountedActiveAccount>;
  readonly accounts: readonly Account[];
}

const toStoredAccountState = (state: MountedAccountState): AccountState => ({
  activeAccount: Option.isSome(state.activeAccount)
    ? Option.some(state.activeAccount.value.data)
    : Option.none(),
  accounts: [...state.accounts],
});

const findAccount = (accounts: readonly Account[], accountId: AccountId) =>
  Option.fromNullishOr(accounts.find((account) => account.id === accountId));

interface AccountsService {
  readonly changes: Stream.Stream<MountedAccountState>;
  readonly getState: Effect.Effect<MountedAccountState>;
  readonly removeAccount: (accountId: AccountId) => Effect.Effect<void, AccountStorageError>;
  readonly setActiveAccount: (accountId: AccountId) => Effect.Effect<void, AccountStorageError>;
  readonly upsertAccount: (account: AccountInput) => Effect.Effect<Account, AccountStorageError>;
}

export class Accounts extends Context.Service<Accounts, AccountsService>()(
  'voel/services/accounts'
) {
  public static readonly make = Effect.fn('Accounts.make')(function* () {
    const mountActiveAccount = Effect.fn('Accounts.mountActiveAccount')(function* (
      account: Account
    ) {
      const scope = yield* Scope.make();
      const authClient = makeAccountAuthClient(account);
      const unsubscribe = authClient.useSession.subscribe(() => void 0);

      yield* Scope.addFinalizer(scope, Effect.sync(unsubscribe));
      yield* Effect.promise(async () => authClient.useSession.get().refetch()).pipe(Effect.ignore);

      return { data: account, state: { authClient, scope } } satisfies MountedActiveAccount;
    });

    const closeActiveAccount = Effect.fn('Accounts.closeActiveAccount')(function* (
      activeAccount: Option.Option<MountedActiveAccount>
    ) {
      if (Option.isSome(activeAccount)) {
        yield* Scope.close(activeAccount.value.state.scope, Exit.void);
      }
    });

    const reconcileActiveAccount = Effect.fn('Accounts.reconcileActiveAccount')(function* ({
      current,
      nextActiveAccount,
      nextAccounts,
    }: {
      readonly current: MountedAccountState;
      readonly nextActiveAccount: Option.Option<Account>;
      readonly nextAccounts: readonly Account[];
    }) {
      if (Option.isNone(nextActiveAccount)) {
        yield* closeActiveAccount(current.activeAccount);
        return {
          activeAccount: Option.none(),
          accounts: nextAccounts,
        } satisfies MountedAccountState;
      }

      if (
        Option.isSome(current.activeAccount) &&
        Equal.equals(current.activeAccount.value.data, nextActiveAccount.value)
      ) {
        return {
          activeAccount: Option.some({
            data: nextActiveAccount.value,
            state: current.activeAccount.value.state,
          }),
          accounts: nextAccounts,
        } satisfies MountedAccountState;
      }

      yield* closeActiveAccount(current.activeAccount);

      return {
        activeAccount: Option.some(yield* mountActiveAccount(nextActiveAccount.value)),
        accounts: nextAccounts,
      } satisfies MountedAccountState;
    });

    const storedState = yield* readStoredAccountState();
    const initialState = yield* reconcileActiveAccount({
      current: { activeAccount: Option.none(), accounts: [] },
      nextActiveAccount: storedState.activeAccount,
      nextAccounts: storedState.accounts,
    });
    const stateRef = yield* SubscriptionRef.make(initialState);

    yield* Effect.addFinalizer(() =>
      SubscriptionRef.get(stateRef).pipe(
        Effect.flatMap((state) => closeActiveAccount(state.activeAccount))
      )
    );

    const persistAndModify = <A>(
      transition: (current: MountedAccountState) => readonly [
        A,
        {
          readonly activeAccount: Option.Option<Account>;
          readonly accounts: readonly Account[];
        },
      ]
    ) =>
      SubscriptionRef.modifyEffect(stateRef, (current) =>
        Effect.gen(function* () {
          const [result, nextStateInput] = transition(current);
          const nextState = yield* reconcileActiveAccount({
            current,
            nextActiveAccount: nextStateInput.activeAccount,
            nextAccounts: nextStateInput.accounts,
          });

          yield* writeStoredAccountState(toStoredAccountState(nextState));

          return [result, nextState] as const;
        })
      );

    const removeAccount = Effect.fn('Accounts.removeAccount')(function* (accountId: AccountId) {
      yield* persistAndModify((current) => {
        const accounts = current.accounts.filter((account) => account.id !== accountId);
        const activeAccount =
          Option.isSome(current.activeAccount) && current.activeAccount.value.data.id !== accountId
            ? Option.some(current.activeAccount.value.data)
            : Option.none();

        return [void 0, { accounts, activeAccount }] as const;
      });
    });

    const setActiveAccount = Effect.fn('Accounts.setActiveAccount')(function* (
      accountId: AccountId
    ) {
      yield* persistAndModify((current) => {
        const activeAccount = findAccount(current.accounts, accountId);

        if (Option.isNone(activeAccount)) {
          return [void 0, toStoredAccountState(current)] as const;
        }

        return [void 0, { ...current, activeAccount }] as const;
      });
    });

    const upsertAccount = Effect.fn('Accounts.upsertAccount')(function* (account: AccountInput) {
      const id = makeAccountId({ serverUrl: account.serverUrl, userId: account.userId });
      const nextAccount = new Account({ ...account, id });

      return yield* persistAndModify((current) => {
        const accounts = current.accounts.filter((stored) => stored.id !== id);

        return [
          nextAccount,
          {
            activeAccount: Option.some(nextAccount),
            accounts: [nextAccount, ...accounts],
          },
        ] as const;
      });
    });

    return Accounts.of({
      changes: SubscriptionRef.changes(stateRef),
      getState: SubscriptionRef.get(stateRef),
      removeAccount,
      setActiveAccount,
      upsertAccount,
    });
  });

  public static readonly layer = Layer.effect(this, this.make());
}
