import type { Stream } from 'effect';
import { Context, Effect, Layer, Option, Schema, SubscriptionRef } from 'effect';
import * as SecureStore from 'expo-secure-store';

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

const Account = Schema.Struct({
  id: AccountId,
  serverUrl: ServerUrl.ServerUrl,
  userId: AccountUserId,
  username: AccountUsername,
  displayName: AccountDisplayName,
});
type Account = typeof Account.Type;

const AccountState = Schema.Struct({
  activeAccountId: Schema.OptionFromNullOr(AccountId),
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
  activeAccountId: Option.none(),
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

export const makeAuthStoragePrefix = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: ServerUrl.ServerUrl;
  readonly username: AccountUsername;
}) => `voel_${ServerUrl.key(serverUrl)}_${username.trim().toLowerCase()}`;
