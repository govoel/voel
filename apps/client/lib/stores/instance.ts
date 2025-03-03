import type { auth } from '@apricotta/server/src/libs/auth/auth';
import { expoClient } from '@better-auth/expo/client';
import { createStore } from '@xstate/store';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { db } from '~/db/client';

import api, { queryClient } from '~/lib/api';

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
    setCurrentInstance: (
      context,
      event: {
        instanceURL: string;
        userID: string;
        username: string;
        email: string;
        name: string;
        image?: string;
        authStore: Map<string, string | null>;
      },
      enqueue
    ) => {
      enqueue.effect(async () => {
        let instanceID = context.instanceID;
        if (context.instanceUserID !== event.userID && context.instanceURL !== event.instanceURL) {
          let instance = await db
            .selectFrom('accounts')
            .select(['instanceID as id', 'instanceURL as url', 'userID'])
            .where('instanceURL', '=', event.instanceURL)
            .where('userID', '=', event.userID)
            .executeTakeFirst();

          if (!instance) {
            instance = await db
              .insertInto('accounts')
              .values({
                instanceURL: event.instanceURL,
                userID: event.userID,
                username: event.username,
                email: event.email,
                name: event.name,
                image: event.image,
              })
              .returning(['instanceID as id', 'instanceURL as url', 'userID as userID'])
              .executeTakeFirst();

            if (!instance) {
              instanceStore.trigger.setError({ error: 'Failed to insert new instance' });
              return;
            }
          } else {
            await db
              .updateTable('accounts')
              .set({
                username: event.username,
                email: event.email,
                name: event.name,
                image: event.image,
              })
              .where('instanceURL', '=', event.instanceURL)
              .where('userID', '=', event.userID)
              .executeTakeFirst();
          }

          instanceID = instance.id.toString();
        } else {
          await db
            .updateTable('accounts')
            .set({
              username: event.username,
              email: event.email,
              name: event.name,
              image: event.image,
            })
            .where('instanceURL', '=', event.instanceURL)
            .where('userID', '=', event.userID)
            .executeTakeFirst();
        }
        queryClient.invalidateQueries({ queryKey: api.accounts.list.queryKey });

        SecureStore.setItem('currentInstanceID', instanceID!);
        SecureStore.setItem('currentInstanceURL', event.instanceURL);
        SecureStore.setItem('currentInstanceUserID', event.userID);

        for (const [key, value] of event.authStore.entries()) {
          SecureStore.setItem(`apricotta_${instanceID}${key}`, value ?? '');
        }

        instanceStore.trigger.recreateAuthInstance({
          instanceID: instanceID!,
          instanceUserID: event.userID,
          instanceURL: event.instanceURL,
        });
      });

      return {
        ...context,
        isPending: true,
        error: null,
      };
    },
  },
});
