import type { auth } from '@apricotta/server/src/libs/auth/auth';
import { expoClient } from '@better-auth/expo/client';
import { createStore } from '@xstate/store';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

export const createAuthClient = (
  baseURL: string,
  storagePrefix: string,
  storage: Parameters<typeof expoClient>['0']['storage'] = SecureStore
) =>
  createBetterAuthClient({
    baseURL,
    fetchOptions: { credentials: 'include' },
    plugins: [
      expoClient({
        scheme: 'apricotta',
        storagePrefix: `${storagePrefix}_better_auth`,
        storage,
      }),
      usernameClient(),
      adminClient(),
      inferAdditionalFields<typeof auth>(),
    ],
  });

export const createInstanceAuthClient = (instanceID: string, instanceURL: string) =>
  createAuthClient(instanceURL, `apricotta_${instanceID}`);

export const useAuthSession = (authClient: ReturnType<typeof createAuthClient>) =>
  authClient.useSession();

export const instanceStore = createStore({
  context: {
    isPending: false,
    error: null as string | null,
    instanceID: SecureStore.getItem('currentInstanceID'),
    instanceURL: SecureStore.getItem('currentInstanceURL'),
    instanceUserID: SecureStore.getItem('currentInstanceUserID'),
    authInstance: createInstanceAuthClient(
      SecureStore.getItem('currentInstanceID') ?? '',
      SecureStore.getItem('currentInstanceURL') ?? 'http://apricotta'
    ),
  },
  on: {
    recreateAuthInstance: (
      _,
      event: {
        instanceID: string;
        instanceURL: string;
        instanceUserID: string;
      }
    ) => {
      return {
        isPending: false,
        error: null,
        instanceID: event.instanceID,
        instanceURL: event.instanceURL,
        instanceUserID: event.instanceUserID,
        authInstance: createInstanceAuthClient(event.instanceID, event.instanceURL),
      };
    },
    setError: (context, event: { error: string }) => {
      return { ...context, isPending: false, error: event.error };
    },
  },
});
