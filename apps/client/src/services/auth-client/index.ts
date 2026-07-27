import { expoClient } from '@better-auth/expo/client';
import { Context, Duration, Effect, Layer, Schema } from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

export class XxHash extends Context.Service<
  XxHash,
  { readonly hash128: (input: string) => Effect.Effect<string> }
>()('voel/services/auth-client/index/XxHash') {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const { hash128 } = yield* Effect.promise(async () => import('react-native-xxhash'));
      return Layer.succeed(XxHash, {
        hash128: (input) => Effect.sync(() => hash128(input)),
      });
    })
  );

  public static readonly layerTest = Layer.succeed(this, {
    hash128: (input) => Effect.succeed(`test-${input.replaceAll(':', '-')}`),
  });
}

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
  xxHash,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly authStorageId: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
  readonly xxHash: XxHash['Service'];
}) =>
  Effect.gen(function* () {
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
