import { expoClient } from '@better-auth/expo/client';
import { Duration, Effect, Schema } from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

import { XxHash } from '#src/services/native.ts';

export class BetterAuthClientInitializationError extends Schema.TaggedErrorClass<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  {
    error: Schema.Unknown,
  }
) {}

export const createVoelAuthClient = ({
  serverUrl,
  authStorageId,
  storage,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly authStorageId: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
}) =>
  Effect.gen(function* () {
    const xxHash = yield* XxHash;
    const storagePrefix = yield* xxHash.hash128(`voel::auth::${serverUrl}::${authStorageId}`);

    return yield* Effect.try({
      try: () =>
        createAuthClient({
          baseURL: serverUrl,
          plugins: [
            expoClient({
              storage,
              storagePrefix,
              cookiePrefix: 'auth',
            }),
          ],
          sessionOptions: {
            refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
          },
        }),
      catch: (error) => new BetterAuthClientInitializationError({ error }),
    });
  });

export type VoelAuthClient = Effect.Success<ReturnType<typeof createVoelAuthClient>>;
