import { expoClient } from '@better-auth/expo/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import type { BetterAuthInstance } from '@repo/auth-api/server.ts';

import type { AccountUsername } from '#src/services/accounts.ts';
import { makeAuthStoragePrefix } from '#src/services/accounts.ts';
import * as ServerUrl from '#src/services/server-url.ts';

export const createVoelAuthClient = ({
  serverUrl,
  username,
}: {
  readonly serverUrl: ServerUrl.ServerUrl;
  readonly username: AccountUsername;
}) =>
  createAuthClient({
    baseURL: ServerUrl.encode(serverUrl),
    basePath: '/api/auth',
    plugins: [
      expoClient({
        storage: SecureStore,
        storagePrefix: makeAuthStoragePrefix({ serverUrl, username }),
        cookiePrefix: 'auth',
      }),
      usernameClient(),
      adminClient(),
      inferAdditionalFields<BetterAuthInstance>(),
    ],
  });

export type VoelAuthClient = ReturnType<typeof createVoelAuthClient>;
