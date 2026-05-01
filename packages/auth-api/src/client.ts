import { expoClient } from '@better-auth/expo/client';
import type { BetterAuthClientOptions } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';

import type { BetterAuthInstance } from '#src/server.ts';

export const createAuthClient = ({
  baseURL,
  expo,
}: Pick<BetterAuthClientOptions, 'baseURL'> & {
  expo: Pick<Parameters<typeof expoClient>['0'], 'storage' | 'storagePrefix'>;
}) =>
  createBetterAuthClient({
    baseURL,
    basePath: '/api/auth',
    plugins: [
      expoClient({
        scheme: 'voel',
        storagePrefix: `${expo.storagePrefix}_auth`,
        storage: expo.storage,
      }),
      usernameClient(),
      adminClient(),
      inferAdditionalFields<BetterAuthInstance>(),
    ],
  });
