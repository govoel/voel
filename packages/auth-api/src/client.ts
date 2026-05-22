import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';

import type { BetterAuthInstance } from '#src/server.ts';

type CreateAuthClientOptions<Plugins extends BetterAuthClientPlugin[] | undefined> = Pick<
  BetterAuthClientOptions,
  'baseURL' | 'fetchOptions' | 'sessionOptions'
> & {
  readonly plugins?: Plugins;
};

export const createAuthClient = <const Plugins extends BetterAuthClientPlugin[] | undefined>({
  baseURL,
  fetchOptions,
  plugins,
  sessionOptions,
}: CreateAuthClientOptions<Plugins>) =>
  createBetterAuthClient({
    baseURL,
    basePath: '/api/auth',
    fetchOptions,
    sessionOptions,
    plugins: [
      ...(plugins ?? []),
      usernameClient(),
      adminClient(),
      inferAdditionalFields<BetterAuthInstance>(),
    ],
  });
