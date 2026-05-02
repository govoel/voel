import type { BetterAuthClientOptions } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';

import type { BetterAuthInstance } from '#src/server.ts';

export const createAuthClient = ({
  baseURL,
  fetchOptions,
}: Pick<BetterAuthClientOptions, 'baseURL' | 'fetchOptions'>) =>
  createBetterAuthClient({
    baseURL,
    basePath: '/api/auth',
    fetchOptions,
    plugins: [usernameClient(), adminClient(), inferAdditionalFields<BetterAuthInstance>()],
  });
