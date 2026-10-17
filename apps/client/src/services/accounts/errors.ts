import { Schema } from 'effect';

import { Account } from '#src/services/database/main/schema.ts';

/** Recoverable connection unavailability or lock contention, with diagnostic cause. */
export class AccountDatabaseError extends Schema.TaggedError<
  AccountDatabaseError,
  { readonly brand: unique symbol }
>('voel/services/accounts/errors/AccountDatabaseError')('AccountDatabaseError', {
  cause: Schema.Defect(),
}) {}

export class AccountNotFoundError extends Schema.TaggedError<
  AccountNotFoundError,
  { readonly brand: unique symbol }
>('voel/services/accounts/errors/AccountNotFoundError')('AccountNotFoundError', {
  serverUrl: Account.fields.serverUrl,
  userId: Account.fields.userId,
}) {}
