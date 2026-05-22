import type { Scope, Stream, Option } from 'effect';
import { Context, Effect, Equal, Exit, Hash, Layer, Schema, SubscriptionRef } from 'effect';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'voel_accounts';

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

const readStoredAccountState = Effect.fnUntraced(function* () {
  const raw = yield* Effect.try({
    try: () => SecureStore.getItem(STORAGE_KEY),
    catch: (cause) => new AccountStorageError({ operation: 'load', cause }),
  });

  if (raw === null || raw === '') {
    return empty();
  }

  return yield* decode(raw).pipe(
    Effect.mapError((cause) => new AccountStateDecodeError({ cause }))
  );
});

const writeStoredAccountState = Effect.fnUntraced(function* (state) {
  const encoded = encode(state);

  yield* Effect.try({
    try: () => {
      SecureStore.setItem(STORAGE_KEY, encoded);
    },
    catch: (cause) => new AccountStorageError({ operation: 'save', cause }),
  });
});

export class AccountManager extends Context.Service<
  AccountManager,
  {
    readonly changes: Stream.Stream<{
      activeAccount: Option.Option<{ data: Account; state: { authClient; scope } }>;
      accounts: Account[];
    }>;
    readonly removeAccount: (accountId: AccountId) => Effect.Effect<void, AccountStorageError>;
    readonly setActiveAccount: (accountId: AccountId) => Effect.Effect<void, AccountStorageError>;
    readonly upsertAccount: (account: AccountInput) => Effect.Effect<Account, AccountStorageError>;
  }
>()('voel/services/accounts/AccountManager') {
  public static readonly make = Effect.gen(function* () {});

  public static readonly layer = Layer.effect(this, this.make);
}
