import { expoClient } from '@better-auth/expo/client';
import { Duration } from 'effect';
import * as SecureStore from 'expo-secure-store';

import { createAuthClient } from '@repo/auth-api/client.ts';

import type { AccountUsername } from '#src/services/accounts.ts';
import * as ServerUrl from '#src/services/server-url.ts';

export const createVoelAuthClient = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: ServerUrl.ServerUrl;
  readonly username: /* Branded String */;
}) =>
  createAuthClient({
    baseURL: ServerUrl.encodeSync(serverUrl),
    plugins: [
      expoClient({
        storage: SecureStore,
        storagePrefix: /* TODO */,
        cookiePrefix: 'auth',
      }),
    ],
    sessionOptions: {
      refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
    },
  });

export type VoelAuthClient = ReturnType<typeof createVoelAuthClient>;
