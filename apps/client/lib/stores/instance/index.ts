import { expoClient } from '@better-auth/expo/client';
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import { type TRPCOptionsProxy, createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { auth } from '@voel/server/src/libs/auth/auth';
import type { AppRouter } from '@voel/server/src/router/root';
import { createStore } from '@xstate/store';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';

import { createInstanceDb } from '~/db/client';

import { queryClient } from '~/lib/api/query-client';

import '@azure/core-asynciterator-polyfill';

import { TextDecoderStream } from '@stardazed/streams-text-encoding';
import { ReadableStream } from 'web-streams-polyfill';

import { ExpoEventSource } from '~/lib/stores/instance/EventSource';

import Player from '~/modules/voel-audio';

globalThis.TextDecoderStream = globalThis.TextDecoderStream || TextDecoderStream;
globalThis.ReadableStream = globalThis.ReadableStream || ReadableStream;
globalThis.EventSource = globalThis.EventSource || ExpoEventSource;

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
        scheme: 'voel',
        storagePrefix: `${storagePrefix}_better_auth`,
        storage,
      }),
      usernameClient(),
      adminClient(),
      inferAdditionalFields<typeof auth>(),
    ],
  });

export const createApiInstance = (
  instanceURL: string,
  authClient: ReturnType<typeof createInstanceAuthClient>,
  currentApiInstance?: TRPCOptionsProxy<AppRouter>
) => {
  if (currentApiInstance) {
    queryClient.resetQueries({ queryKey: currentApiInstance.pathKey() });
  }
  return createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            EventSource: ExpoEventSource,
            eventSourceOptions: {
              headers: {
                Cookie: authClient.getCookie(),
              },
            },
            url: `${instanceURL}/api/trpc`,
          }),
          false: httpBatchStreamLink({
            url: `${instanceURL}/api/trpc`,
            headers: () => ({
              Cookie: authClient.getCookie(),
            }),
            fetch: (url, opts) => expoFetch(url, opts),
          }),
        }),
      ],
    }),
    queryClient: queryClient,
  });
};

export const createInstances = (
  instanceID: string,
  instanceURL: string,
  currentApiInstance?: TRPCOptionsProxy<AppRouter>
) => {
  const instanceIDNum = parseInt(instanceID, 10);

  if (isNaN(instanceIDNum)) {
    throw new Error(`Invalid instance ID: ${instanceID}`);
  }

  const authInstance = createInstanceAuthClient(instanceID, instanceURL);
  const apiInstance = createApiInstance(instanceURL, authInstance, currentApiInstance);
  const { instanceDb, instanceOpDb } = createInstanceDb(instanceIDNum);

  return {
    authInstance,
    apiInstance,
    instanceDb,
    instanceOpDb,
  };
};

export const createInstanceAuthClient = (instanceID: string, instanceURL: string) =>
  createAuthClient(instanceURL, `voel_${instanceID}`);

export const useAuthSession = (authClient: ReturnType<typeof createInstanceAuthClient>) =>
  authClient.useSession();

export const instanceStore = createStore({
  context: {
    isPending: false,
    error: null as string | null,
    instanceID: SecureStore.getItem('currentInstanceID'),
    instanceURL: SecureStore.getItem('currentInstanceURL'),
    instanceUserID: SecureStore.getItem('currentInstanceUserID'),
    ...createInstances(
      SecureStore.getItem('currentInstanceID') ?? '0',
      SecureStore.getItem('currentInstanceURL') ?? 'http://voel.local'
    ),
  },
  on: {
    recreateAuthInstance: (
      context,
      event: {
        instanceID: string;
        instanceURL: string;
        instanceUserID: string;
      }
    ) => {
      SecureStore.setItem('currentInstanceID', event.instanceID);
      SecureStore.setItem('currentInstanceURL', event.instanceURL);
      SecureStore.setItem('currentInstanceUserID', event.instanceUserID);
      Player.clearQueue();

      return {
        isPending: false,
        error: null,
        instanceID: event.instanceID,
        instanceURL: event.instanceURL,
        instanceUserID: event.instanceUserID,
        ...createInstances(event.instanceID, event.instanceURL, context.apiInstance),
      };
    },
    setError: (context, event: { error: string }) => {
      return { ...context, isPending: false, error: event.error };
    },
  },
});
