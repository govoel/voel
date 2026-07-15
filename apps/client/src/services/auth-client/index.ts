import { expoClient } from '@better-auth/expo/client';
import { Duration, Effect, Schema } from 'effect';
import { hash128 } from 'react-native-xxhash';

import { createAuthClient } from '@repo/auth-api/client.ts';

export class BetterAuthClientInitializationError extends Schema.TaggedErrorClass<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>()('voel/services/auth-client/index/BetterAuthClientInitializationError', {
  error: Schema.Unknown,
}) {}

export const createVoelAuthClient = ({
  serverUrl,
  authStorageId,
  storage,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly authStorageId: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
}) =>
  Effect.try({
    try: () =>
      createAuthClient({
        baseURL: serverUrl,
        plugins: [
          expoClient({
            storage,
            storagePrefix: hash128(`voel::auth::${serverUrl}::${authStorageId}`),
            cookiePrefix: 'auth',
          }),
        ],
        sessionOptions: {
          refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
        },
      }),
    catch: (error) => new BetterAuthClientInitializationError({ error }),
  });
