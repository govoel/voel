import { Schema } from 'effect';

import { AuthError } from '@repo/auth-api/shared.ts';

import { Account } from '#src/domains/accounts/schema.ts';

/** Recoverable connection unavailability or lock contention, with diagnostic cause. */
export class AccountDatabaseError extends Schema.TaggedError<
  AccountDatabaseError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/errors/AccountDatabaseError')('AccountDatabaseError', {
  cause: Schema.Defect(),
}) {}

export class AccountCredentialsError extends Schema.TaggedError<
  AccountCredentialsError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/errors/AccountCredentialsError')('AccountCredentialsError', {
  cause: Schema.Defect(),
}) {}

export class AccountNotFoundError extends Schema.TaggedError<
  AccountNotFoundError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/errors/AccountNotFoundError')('AccountNotFoundError', {
  serverUrl: Account.fields.serverUrl,
  userId: Account.fields.userId,
}) {}

export class AccountSignInError extends Schema.TaggedError<
  AccountSignInError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/errors/AccountSignInError')('AccountSignInError', {
  reason: AuthError.fields.reason,
}) {}

export class AccountSignUpError extends Schema.TaggedError<
  AccountSignUpError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/errors/AccountSignUpError')('AccountSignUpError', {
  reason: AuthError.fields.reason,
}) {}
