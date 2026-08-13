import { Effect, Option, Schema } from 'effect';

const UnknownBetterAuthErrorFields = {
  code: 'UNKNOWN',
  status: 0,
  statusText: 'UNKNOWN',
} as const;

export class BetterAuthError extends Schema.Error<
  BetterAuthError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/errors/BetterAuthError')({
  _tag: Schema.tagDefaultOmit('BetterAuthError'),
  code: Schema.String.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(UnknownBetterAuthErrorFields.code))
  ),
  message: Schema.optional(Schema.String),
  status: Schema.Finite.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(UnknownBetterAuthErrorFields.status))
  ),
  statusText: Schema.String.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(UnknownBetterAuthErrorFields.statusText))
  ),
}) {
  public static readonly decodeFromUnknown = this.pipe(
    Schema.catchDecoding(() =>
      Effect.succeed(Option.some(BetterAuthError.make(UnknownBetterAuthErrorFields)))
    ),
    Schema.decodeUnknownSync
  );
}
