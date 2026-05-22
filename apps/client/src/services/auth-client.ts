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
  readonly username: AccountUsername;
}) => {
  const client = createAuthClient({
    baseURL: ServerUrl.encodeSync(serverUrl),
    plugins: [
      expoClient({
        storage: SecureStore,
        storagePrefix: `voel:${encodeURIComponent(ServerUrl.encodeSync(serverUrl))}:${encodeURIComponent(username)}`,
        cookiePrefix: 'auth',
      }),
    ],
    sessionOptions: {
      refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
    },
  });

  const maybeGetCookie: unknown = Reflect.get(client, 'getCookie');
  const getCookie =
    typeof maybeGetCookie === 'function'
      ? () => String(Reflect.apply(maybeGetCookie, client, []))
      : () => '';

  return Object.assign(client, { getCookie });
};

export type VoelAuthClient = ReturnType<typeof createVoelAuthClient>;
