import { Context, Effect, Layer, Option, Schema, SubscriptionRef } from 'effect';
import type { Stream } from 'effect';
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

const emptyAccountState = (): AccountState => ({
  activeAccountId: Option.none(),
  accounts: [],
});

const loadAccountState = Effect.sync(() => {
  const raw = SecureStore.getItem(STORAGE_KEY);
  return raw === '' ? null : raw;
}).pipe(
  Effect.flatMap((raw) =>
    raw === null
      ? Effect.succeed(emptyAccountState())
      : decodeAccountStateString(raw).pipe(
          Effect.catchCause(() => Effect.succeed(emptyAccountState()))
        )
  )
);

interface AccountsService {
  readonly changes: Stream.Stream<AccountState>;
  readonly removeAccount: (accountId: AccountId) => Effect.Effect<void>;
  readonly setActiveAccount: (accountId: AccountId) => Effect.Effect<void>;
  readonly upsertAccount: (account: Omit<Account, 'id'>) => Effect.Effect<Account>;
}

export class Accounts extends Context.Service<Accounts, AccountsService>()(
  'voel/services/accounts'
) {
  public static readonly make = Effect.gen(function* () {
    const stateRef = yield* SubscriptionRef.make(yield* loadAccountState);

    const writeState = (nextState: AccountState) =>
      Effect.gen(function* () {
        yield* Effect.sync(() => {
          SecureStore.setItem(STORAGE_KEY, encodeAccountStateString(nextState));
        });
        yield* SubscriptionRef.set(stateRef, nextState);
      });

    return Accounts.of({
      changes: SubscriptionRef.changes(stateRef),
      removeAccount: (accountId) =>
        Effect.gen(function* () {
          const current = yield* SubscriptionRef.get(stateRef);
          const accounts = current.accounts.filter((account) => account.id !== accountId);

          yield* writeState({
            accounts,
            activeAccountId: Option.contains(current.activeAccountId, accountId)
              ? Option.none()
              : current.activeAccountId,
          });
        }),
      setActiveAccount: (accountId) =>
        Effect.gen(function* () {
          const current = yield* SubscriptionRef.get(stateRef);

          if (current.accounts.some((account) => account.id === accountId)) {
            yield* writeState({ ...current, activeAccountId: Option.some(accountId) });
          }
        }),
      upsertAccount: (account) =>
        Effect.gen(function* () {
          const current = yield* SubscriptionRef.get(stateRef);
          const id = makeAccountId({ serverUrl: account.serverUrl, userId: account.userId });
          const nextAccount = { ...account, id };
          const accounts = current.accounts.filter((stored) => stored.id !== id);

          yield* writeState({
            activeAccountId: Option.some(id),
            accounts: [nextAccount, ...accounts],
          });

          return nextAccount;
        }),
    });
  });

  public static readonly layer = Layer.effect(this, this.make);
}

export const makeAuthStoragePrefix = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: ServerUrl;
  readonly username: AccountUsername;
}) => `voel_${serverUrlKey(serverUrl)}_${username.trim().toLowerCase()}`;
