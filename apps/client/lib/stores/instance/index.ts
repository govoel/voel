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
  instanceId: string,
  instanceURL: string,
  currentApiInstance?: TRPCOptionsProxy<AppRouter>
) => {
  const instanceIdNum = parseInt(instanceId, 10);

  if (isNaN(instanceIdNum)) {
    throw new Error(`Invalid instance ID: ${instanceId}`);
  }

  const authInstance = createInstanceAuthClient(instanceId, instanceURL);
  const apiInstance = createApiInstance(instanceURL, authInstance, currentApiInstance);
  const { instanceDb, instanceOpDb } = createInstanceDb(instanceIdNum);

  return {
    authInstance,
    apiInstance,
    instanceDb,
    instanceOpDb,
  };
};

export const createInstanceAuthClient = (instanceId: string, instanceURL: string) =>
  createAuthClient(instanceURL, `voel_${instanceId}`);

export const useAuthSession = (authClient: ReturnType<typeof createInstanceAuthClient>) =>
  authClient.useSession();

export const instanceStore = createStore({
  context: {
    isPending: false,
    error: null as string | null,
    instanceId: SecureStore.getItem('currentInstanceId'),
    instanceURL: SecureStore.getItem('currentInstanceURL'),
    instanceUserId: SecureStore.getItem('currentInstanceUserId'),
    ...createInstances(
      SecureStore.getItem('currentInstanceId') ?? '0',
      SecureStore.getItem('currentInstanceURL') ?? 'http://0.0.0.0'
    ),
  },
  on: {
    recreateAuthInstance: (
      context,
      event: {
        instanceId: string;
        instanceURL: string;
        instanceUserId: string;
      }
    ) => {
      SecureStore.setItem('currentInstanceId', event.instanceId);
      SecureStore.setItem('currentInstanceURL', event.instanceURL);
      SecureStore.setItem('currentInstanceUserId', event.instanceUserId);
      Player.clearQueue();

      return {
        isPending: false,
        error: null,
        instanceId: event.instanceId,
        instanceURL: event.instanceURL,
        instanceUserId: event.instanceUserId,
        ...createInstances(event.instanceId, event.instanceURL, context.apiInstance),
      };
    },
    setError: (context, event: { error: string }) => {
      return { ...context, isPending: false, error: event.error };
    },
  },
});
