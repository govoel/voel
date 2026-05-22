import { expoClient } from '@better-auth/expo/client';
import { Duration } from 'effect';
import * as SecureStore from 'expo-secure-store';

import { createAuthClient } from '@repo/auth-api/client.ts';

import type { AccountTable } from '#src/services/accounts/index.ts';

export const createVoelAuthClient = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: AccountTable['serverUrl'];
  readonly username: AccountTable['username'];
}) =>
  createAuthClient({
    baseURL: serverUrl,
    plugins: [
      expoClient({
        storage: SecureStore,
        storagePrefix: `voel:${encodeURIComponent(serverUrl)}:${encodeURIComponent(username)}`,
        cookiePrefix: 'auth',
      }),
    ],
    sessionOptions: {
      refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
    },
  });
