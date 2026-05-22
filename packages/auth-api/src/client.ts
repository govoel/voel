import type { BetterAuthClientOptions } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';

import type { BetterAuthInstance } from '#src/server.ts';

export const createAuthClient = ({
  baseURL,
  fetchOptions,
  plugins = [],
  sessionOptions,
}: Pick<BetterAuthClientOptions, 'baseURL' | 'fetchOptions' | 'plugins' | 'sessionOptions'>) =>
  createBetterAuthClient({
    baseURL,
    basePath: '/api/auth',
    fetchOptions,
    sessionOptions,
    plugins: [
      ...plugins,
      usernameClient(),
      adminClient(),
      inferAdditionalFields<BetterAuthInstance>(),
    ],
  });
