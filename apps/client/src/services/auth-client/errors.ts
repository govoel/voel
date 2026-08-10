import { Option, Schema } from 'effect';

const BetterAuthErrorFields = {
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.Number,
  statusText: Schema.String,
};

const decodeBetterAuthErrorFieldsOption = Schema.decodeUnknownOption(
  Schema.Struct(BetterAuthErrorFields)
);

export class BetterAuthError extends Schema.TaggedError<
  BetterAuthError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/errors/BetterAuthError')('BetterAuthError', BetterAuthErrorFields) {}

export const betterAuthErrorFromUnknown = (error: unknown) => {
  const fields = decodeBetterAuthErrorFieldsOption(error);
  if (Option.isSome(fields)) {
    return new BetterAuthError(fields.value);
  }

  return error instanceof Error
    ? new BetterAuthError({
        message: error.message,
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      })
    : new BetterAuthError({
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      });
};
