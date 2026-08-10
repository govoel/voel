import { Option, Schema } from 'effect';

const BetterAuthErrorFields = {
  code: Schema.optional(Schema.String),
  message: Schema.String,
  status: Schema.Number,
  statusText: Schema.String,
};

const decodeBetterAuthErrorFieldsOption = Schema.decodeUnknownOption(
  Schema.Struct({ ...BetterAuthErrorFields, message: Schema.optional(Schema.String) })
);

export class BetterAuthError extends Schema.TaggedError<
  BetterAuthError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/errors/BetterAuthError')('BetterAuthError', BetterAuthErrorFields) {}

export const betterAuthErrorFromUnknown = (error: unknown) => {
  const fields = decodeBetterAuthErrorFieldsOption(error);
  if (Option.isSome(fields)) {
    return new BetterAuthError({
      ...fields.value,
      message: fields.value.message ?? 'An unknown error occurred.',
    });
  }

  return error instanceof Error
    ? new BetterAuthError({
        message: error.message,
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      })
    : new BetterAuthError({
        message: 'An unknown error occurred.',
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      });
};
