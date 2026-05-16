import { Context, Effect, Layer, Option, Schema, Stream, SubscriptionRef } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import * as SecureStore from 'expo-secure-store';

import { ServerUrl, serverUrlKey } from '#src/services/server-url.ts';

const STORAGE_KEY = 'voel_accounts';

export const AccountId = Schema.String.pipe(Schema.brand('AccountId'));
export type AccountId = typeof AccountId.Type;

export const AccountUserId = Schema.String.pipe(Schema.brand('AccountUserId'));
export type AccountUserId = typeof AccountUserId.Type;

export const AccountUsername = Schema.String.pipe(Schema.brand('AccountUsername'));
export type AccountUsername = typeof AccountUsername.Type;

export const AccountDisplayName = Schema.String.pipe(Schema.brand('AccountDisplayName'));
export type AccountDisplayName = typeof AccountDisplayName.Type;

export const Account = Schema.Struct({
  id: AccountId,
  serverUrl: ServerUrl,
  userId: AccountUserId,
  username: AccountUsername,
  displayName: AccountDisplayName,
});
export type Account = typeof Account.Type;

const AccountState = Schema.Struct({
  activeAccountId: Schema.OptionFromNullOr(AccountId),
  accounts: Schema.Array(Account),
});
export type AccountState = typeof AccountState.Type;

export class AccountStorageError extends Schema.TaggedErrorClass<AccountStorageError>()(
  'voel/services/accounts/AccountStorageError',
  {
    operation: Schema.Union([Schema.Literal('load'), Schema.Literal('save')]),
    cause: Schema.Defect,
  }
) {}

export class AccountStateDecodeError extends Schema.TaggedErrorClass<AccountStateDecodeError>()(
  'voel/services/accounts/AccountStateDecodeError',
  {
    cause: Schema.Defect,
  }
) {}

const AccountStateString = Schema.fromJsonString(AccountState);
const decodeAccountId = Schema.decodeUnknownSync(AccountId);
const decodeAccountStateString = Schema.decodeUnknownEffect(AccountStateString);
const encodeAccountStateString = Schema.encodeSync(AccountStateString);

export const makeAccountId = ({
  serverUrl,
  userId,
}: {
  readonly serverUrl: ServerUrl;
  readonly userId: AccountUserId;
}): AccountId => decodeAccountId(`${serverUrlKey(serverUrl)}_${userId}`);

export const emptyAccountState = (): AccountState => ({
  activeAccountId: Option.none(),
  accounts: [],
});

const readStoredAccountState = Effect.fn('Accounts.readStoredAccountState')(
  function* (): Effect.fn.Return<AccountState, AccountStorageError | AccountStateDecodeError> {
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
  }
);

const writeStoredAccountState = Effect.fn('Accounts.writeStoredAccountState')(function* (
  state: AccountState
): Effect.fn.Return<void, AccountStorageError> {
  const encoded = encodeAccountStateString(state);

  yield* Effect.try({
    try: () => {
      SecureStore.setItem(STORAGE_KEY, encoded);
    },
    catch: (cause) => new AccountStorageError({ operation: 'save', cause }),
  });
});

type AccountInput = Omit<Account, 'id'>;

interface AccountsService {
  readonly changes: Stream.Stream<AccountState>;
  readonly getState: Effect.Effect<AccountState>;
  readonly removeAccount: (accountId: AccountId) => Effect.Effect<void, AccountStorageError>;
  readonly setActiveAccount: (accountId: AccountId) => Effect.Effect<void, AccountStorageError>;
  readonly upsertAccount: (account: AccountInput) => Effect.Effect<Account, AccountStorageError>;
}

export class Accounts extends Context.Service<Accounts, AccountsService>()(
  'voel/services/accounts'
) {
  public static readonly make = Effect.fn('Accounts.make')(function* () {
    const stateRef = yield* SubscriptionRef.make(yield* readStoredAccountState());

    const persistAndModify = <A>(
      transition: (current: AccountState) => readonly [A, AccountState]
    ) =>
      SubscriptionRef.modifyEffect(stateRef, (current) =>
        Effect.gen(function* () {
          const [result, nextState] = transition(current);

          yield* writeStoredAccountState(nextState);

          return [result, nextState] as const;
        })
      );

    const removeAccount = Effect.fn('Accounts.removeAccount')(function* (accountId: AccountId) {
      yield* persistAndModify((current) => {
        const accounts = current.accounts.filter((account) => account.id !== accountId);

        return [
          void 0,
          {
            accounts,
            activeAccountId: Option.contains(current.activeAccountId, accountId)
              ? Option.none()
              : current.activeAccountId,
          },
        ] as const;
      });
    });

    const setActiveAccount = Effect.fn('Accounts.setActiveAccount')(function* (
      accountId: AccountId
    ) {
      yield* persistAndModify((current) => {
        if (!current.accounts.some((account) => account.id === accountId)) {
          return [void 0, current] as const;
        }

        return [void 0, { ...current, activeAccountId: Option.some(accountId) }] as const;
      });
    });

    const upsertAccount = Effect.fn('Accounts.upsertAccount')(function* (account: AccountInput) {
      const id = makeAccountId({ serverUrl: account.serverUrl, userId: account.userId });
      const nextAccount = { ...account, id };

      return yield* persistAndModify((current) => {
        const accounts = current.accounts.filter((stored) => stored.id !== id);

        return [
          nextAccount,
          {
            activeAccountId: Option.some(id),
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

export const AccountsRuntime = Atom.runtime(Accounts.layer);

export const accountStateAtom = AccountsRuntime.atom(
  Stream.unwrap(Accounts.pipe(Effect.map((accounts) => accounts.changes))),
  { initialValue: emptyAccountState() }
);

export const removeAccountAtom = AccountsRuntime.fn<AccountId>()((accountId) =>
  Accounts.pipe(Effect.flatMap((accounts) => accounts.removeAccount(accountId)))
);

export const setActiveAccountAtom = AccountsRuntime.fn<AccountId>()((accountId) =>
  Accounts.pipe(Effect.flatMap((accounts) => accounts.setActiveAccount(accountId)))
);

export const upsertAccountAtom = AccountsRuntime.fn<AccountInput>()((account) =>
  Accounts.pipe(Effect.flatMap((accounts) => accounts.upsertAccount(account)))
);

export const makeAuthStoragePrefix = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: ServerUrl;
  readonly username: AccountUsername;
}) => `voel_${serverUrlKey(serverUrl)}_${username.trim().toLowerCase()}`;
