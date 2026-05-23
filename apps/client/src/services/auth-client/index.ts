import { expoClient } from '@better-auth/expo/client';
import { Duration } from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

export const createVoelAuthClient = ({
  serverUrl,
  username,
  storage,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly username: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
}) =>
  createAuthClient({
    baseURL: serverUrl,
    plugins: [
      expoClient({
        storage,
        storagePrefix: `voel:authClient:${encodeURIComponent(serverUrl)}:${encodeURIComponent(username)}`,
        cookiePrefix: 'auth',
      }),
    ],
    sessionOptions: {
      refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
    },
  });
