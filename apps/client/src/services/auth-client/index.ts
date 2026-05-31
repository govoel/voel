import { expoClient } from '@better-auth/expo/client';
import { Duration, Effect, Schema } from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

export class BetterAuthClientInitializationError extends Schema.TaggedErrorClass<BetterAuthClientInitializationError>()(
  'voel/services/auth-client/index/BetterAuthClientInitializationError',
  { error: Schema.Unknown }
) {}

export const createVoelAuthClient = ({
  serverUrl,
  username,
  storage,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly username: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
}) =>
  Effect.try({
    try: () =>
      createAuthClient({
        baseURL: serverUrl,
        plugins: [
          expoClient({
            storage,
            storagePrefix: `voel_authClient_${encodeURIComponent(serverUrl).replaceAll('%', '-')}_${encodeURIComponent(username).replaceAll('%', '-')}`,
            cookiePrefix: 'auth',
          }),
        ],
        sessionOptions: {
          refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
        },
      }),
    catch: (error) => new BetterAuthClientInitializationError({ error }),
  });
