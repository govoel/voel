import type { BetterAuthClientOptions } from 'better-auth/client';
import { Effect, Option, Schema } from 'effect';

import {
  AuthError,
  AuthTransportError,
  BetterAuthApiError,
  InvalidAuthInputError,
  InvalidAuthResponseError,
} from '#src/shared.ts';

type RequestSignal = NonNullable<NonNullable<BetterAuthClientOptions['fetchOptions']>['signal']>;

/** Build an auth action that encodes domain input and decodes untrusted transport data. */
export const request = <Request extends Schema.Constraint, Result extends Schema.Constraint>({
  Request,
  Result,
  execute,
}: {
  readonly Request: Request;
  readonly Result: Result;
  readonly execute: (options: {
    readonly request: Request['Encoded'];
    readonly signal: RequestSignal;
  }) => Promise<{ readonly data: unknown; readonly error: unknown }>;
}) => {
  const encode = Schema.encodeEffect(Request, { onExcessProperty: 'error' });
  // oxlint-disable-next-line effecttsgo/prefer-typed-schema-decoder -- Transport data is untrusted, regardless of the result schema's Encoded type.
  const decode = Schema.decodeUnknownEffect(Result);

  return Effect.fnUntraced(
    function* (input: Request['Type']) {
      const encoded = yield* encode(input).pipe(
        Effect.catchTag('SchemaError', () => InvalidAuthInputError.make())
      );
      const result = yield* Effect.tryPromise({
        try: async (signal) =>
          execute({
            request: encoded,
            // React Native and DOM disagree on AbortSignal.onabort, but Effect uses the runtime's controller.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion -- Required when checking React Native consumers.
            signal: signal as RequestSignal,
          }),
        catch: (cause) => AuthTransportError.make({ cause }),
      });

      if (result.error !== null) {
        return yield* Option.getOrElse(BetterAuthApiError.decodeUnknownOption(result.error), () =>
          InvalidAuthResponseError.make()
        );
      }

      if (result.data === null) {
        return yield* InvalidAuthResponseError.make();
      }

      return yield* decode(result.data).pipe(
        Effect.catchTag('SchemaError', () => InvalidAuthResponseError.make())
      );
    },
    Effect.catchTags({
      InvalidAuthInputError: (reason) => AuthError.make({ reason }),
      AuthTransportError: (reason) => AuthError.make({ reason }),
      BetterAuthApiError: (reason) => AuthError.make({ reason }),
      InvalidAuthResponseError: (reason) => AuthError.make({ reason }),
    })
  );
};
