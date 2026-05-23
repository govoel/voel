import { expoClient } from '@better-auth/expo/client';
import { Duration } from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

import type { AccountTable } from '#src/services/accounts/index.ts';

export const createVoelAuthClient = ({
  serverUrl,
  username,
  storage,
}: {
  readonly serverUrl: AccountTable['serverUrl'];
  readonly username: AccountTable['username'];
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
}) =>
  createAuthClient({
    baseURL: serverUrl,
    plugins: [
      expoClient({
        storage,
        storagePrefix: `voel:${encodeURIComponent(serverUrl)}:${encodeURIComponent(username)}`,
        cookiePrefix: 'auth',
      }),
    ],
    sessionOptions: {
      refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
    },
  });
