import { Schema } from 'effect';

export class BetterAuthErrorDetails extends Schema.Class<
  BetterAuthErrorDetails,
  { readonly brand: unique symbol }
>('voel/services/auth-client/errors/BetterAuthErrorDetails')({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.Number,
  statusText: Schema.String,
}) {}

export const betterAuthErrorDetailsFromUnknown = (error: unknown) =>
  error instanceof Error
    ? new BetterAuthErrorDetails({
        message: error.message,
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      })
    : new BetterAuthErrorDetails({
        message: 'An unknown error occurred.',
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      });
