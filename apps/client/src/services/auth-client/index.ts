import { expoClient } from '@better-auth/expo/client';
import { Context, Data, Duration, Effect, Layer, LayerMap, Schema } from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

import {
  BetterAuthErrorDetails,
  betterAuthErrorDetailsFromUnknown,
} from '#src/services/auth-client/errors.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';

export const makeAuthStorageKey = ({
  serverUrl,
  authStorageId,
}: {
  readonly serverUrl: string;
  readonly authStorageId: string;
}) => `voel::auth::${serverUrl}::${authStorageId}`;

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

export class BetterAuthClientInitializationError extends Schema.TaggedError<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  {
    error: Schema.Unknown,
  }
) {}

export interface AuthClientKeyFields {
  readonly serverUrl: string;
  readonly authStorageId: string;
}

export class AuthClientKey extends Data.Class<AuthClientKeyFields> {}

export const makeAuthClientKey = ({
  serverUrl,
  authStorageId,
}: AuthClientKeyFields): AuthClientKey => new AuthClientKey({ serverUrl, authStorageId });

export const createVoelAuthClient = Effect.fnUntraced(function* ({
  serverUrl,
  authStorageId,
  storage,
  xxHash,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly authStorageId: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
  readonly xxHash: XxHash['Service'];
}) {
  const storagePrefix = yield* xxHash.hash128(makeAuthStorageKey({ serverUrl, authStorageId }));

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

export class AuthClient extends Context.Service<AuthClient, VoelAuthClient>()(
  'voel/services/auth-client/index/AuthClient'
) {}

class AuthClientFactory extends Context.Service<AuthClientFactory>()(
  'voel/services/auth-client/index/AuthClientFactory',
  {
    make: Effect.gen(function* () {
      yield* AuthClientStorage;
      const xxHash = yield* XxHash;

      const runWithAuthClientStorage = yield* Effect.context<AuthClientStorage>().pipe(
        Effect.map(Effect.runSyncWith)
      );

      const authClientStorage = {
        getItem: (key) =>
          runWithAuthClientStorage(
            AuthClientStorage.pipe(
              Effect.flatMap((storage) => storage.getItem(key)),
              Effect.map((value) => value.valueOrUndefined ?? null)
            )
          ),
        setItem: (key, value) => {
          runWithAuthClientStorage(
            AuthClientStorage.pipe(Effect.flatMap((storage) => storage.setItem(key, value)))
          );
        },
      } satisfies Parameters<typeof createVoelAuthClient>[0]['storage'];

      return {
        create: ({
          serverUrl,
          authStorageId,
        }: Pick<AuthClientKey, 'serverUrl' | 'authStorageId'>) =>
          createVoelAuthClient({
            serverUrl,
            authStorageId,
            storage: authClientStorage,
            xxHash,
          }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}

export class AuthClientMap extends LayerMap.Service<AuthClientMap>()(
  'voel/services/auth-client/index/AuthClientMap',
  {
    lookup: (key: AuthClientKey) =>
      Layer.effect(
        AuthClient,
        Effect.gen(function* () {
          const factory = yield* AuthClientFactory;
          return yield* factory.create(key);
        })
      ),
    dependencies: [AuthClientFactory.layer],
  }
) {}

export const getAuthClient = (key: AuthClientKeyFields) =>
  AuthClientMap.contextEffect(makeAuthClientKey(key)).pipe(Effect.map(Context.get(AuthClient)));

export class AuthClientRequestError extends Schema.TaggedError<
  AuthClientRequestError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/AuthClientRequestError')('AuthClientRequestError', {
  details: BetterAuthErrorDetails,
}) {}

export class NoActiveAccountError extends Schema.TaggedError<
  NoActiveAccountError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/NoActiveAccountError')('NoActiveAccountError', {}) {}

export const authClientRequest = Effect.fnUntraced(function* <A>(
  request: () => Promise<{ readonly data: A | null; readonly error: object | null }>
) {
  const result = yield* Effect.tryPromise({
    try: request,
    catch: (error) =>
      new AuthClientRequestError({
        details: betterAuthErrorDetailsFromUnknown(error),
      }),
  });

  if (result.error !== null) {
    return yield* new AuthClientRequestError({
      details: betterAuthErrorDetailsFromUnknown(result.error),
    });
  }

  if (result.data === null) {
    return yield* new AuthClientRequestError({
      details: betterAuthErrorDetailsFromUnknown(new Error('Authentication response was empty.')),
    });
  }

  return result.data;
});
