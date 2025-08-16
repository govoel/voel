import { expoClient } from '@better-auth/expo/client';
import { open } from '@op-engineering/op-sqlite';
import type { DB } from '@op-engineering/op-sqlite';
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { auth } from '@voel/server/src/libs/auth/auth';
import type { AppRouter } from '@voel/server/src/router/root';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { useAuthQuery } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { CompiledQuery, type Insertable, Kysely } from 'kysely';
import { toast } from 'sonner-native';

import { queryClient } from '~/lib/api/query-client';
import { mainDb } from '~/lib/db/client';
import { OpSqliteDialect } from '~/lib/db/driver';
import { createInstanceDbMigrator } from '~/lib/db/migrations/instance';
import type {
  AudiobookChapterTable,
  AudiobookFileTable,
  BookContributorTable,
  BookSeriesTable,
  BookTable,
  ContributorTable,
  EBookFileTable,
  InstanceDatabase,
  LibraryTable,
  PlaybackHistoryTable,
  SeriesTable,
} from '~/lib/db/schema/instance';
import { ExpoEventSource } from '~/lib/stores/instance/EventSource';
import {
  ensureExact,
  flushHistoryData,
  upsertAudiobookChapter,
  upsertAudiobookFile,
  upsertBook,
  upsertBookContributor,
  upsertBookSeries,
  upsertContributor,
  upsertEBookFile,
  upsertLibrary,
  upsertPlaybackHistory,
  upsertSeries,
} from '~/lib/stores/instance/sync';

import Player from '~/modules/voel-audio';

import '@azure/core-asynciterator-polyfill';

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
  authClient: ReturnType<typeof createInstanceAuthClient>
) => {
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
          false: httpBatchLink({
            url: `${instanceURL}/api/trpc`,
            headers: () => ({
              Cookie: authClient.getCookie(),
            }),
          }),
        }),
      ],
    }),
    queryClient: queryClient,
  });
};

const startRealtimeSync = (
  instanceId: string | null,
  instanceDb: Kysely<InstanceDatabase<'regular'>>,
  apiInstance: ReturnType<typeof createApiInstance>
) => {
  Promise.all([
    instanceDb
      .selectFrom('library')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('libraryUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('contributor')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('contributorUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('series')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('seriesUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('book')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('bookUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('bookSeries')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('bookSeriesUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('bookContributor')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('bookContributorUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('audiobookFile')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('audiobookFileUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('audiobookChapter')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('audiobookChapterUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('ebookFile')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('ebookFileUpdatedAt'))
      .executeTakeFirstOrThrow(),
    instanceDb
      .selectFrom('playbackHistory')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('playbackHistoryUpdatedAt'))
      .executeTakeFirstOrThrow(),
  ])
    .then((results) => {
      const subscriptionOptions = apiInstance.v1.sync.subscribe.subscriptionOptions({
        library: results[0].libraryUpdatedAt ?? 0,
        contributor: results[1].contributorUpdatedAt ?? 0,
        series: results[2].seriesUpdatedAt ?? 0,
        book: results[3].bookUpdatedAt ?? 0,
        bookSeries: results[4].bookSeriesUpdatedAt ?? 0,
        bookContributor: results[5].bookContributorUpdatedAt ?? 0,
        audiobookFile: results[6].audiobookFileUpdatedAt ?? 0,
        audiobookChapter: results[7].audiobookChapterUpdatedAt ?? 0,
        ebookFile: results[8].ebookFileUpdatedAt ?? 0,
        playbackHistory: results[9].playbackHistoryUpdatedAt ?? 0,
      });

      let queue = Promise.resolve();

      const historyData = {
        rowCount: 0,
        library: [] as Insertable<LibraryTable<'realtime'>>[],
        contributor: [] as Insertable<ContributorTable<'realtime'>>[],
        series: [] as Insertable<SeriesTable<'realtime'>>[],
        book: [] as Insertable<BookTable<'realtime'>>[],
        bookSeries: [] as Insertable<BookSeriesTable<'realtime'>>[],
        bookContributor: [] as Insertable<BookContributorTable<'realtime'>>[],
        audiobookFile: [] as Insertable<AudiobookFileTable<'realtime'>>[],
        audiobookChapter: [] as Insertable<AudiobookChapterTable<'realtime'>>[],
        ebookFile: [] as Insertable<EBookFileTable<'realtime'>>[],
        playbackHistory: [] as Insertable<PlaybackHistoryTable<'realtime'>>[],
      };

      const { unsubscribe } = subscriptionOptions.subscribe({
        onStarted: () => {
          instanceStore.trigger.setSyncStatus({ instanceId, status: 'waiting' });
        },
        onData: (data) => {
          queue = queue.then(async () => {
            try {
              if (data.type === 'history') {
                historyData.rowCount += 1;
                instanceStore.trigger.setSyncStatus({ instanceId, status: 'processing' });
                if (data.payload.table === 'library') {
                  historyData.library.push(
                    ensureExact<Insertable<LibraryTable<'realtime'>>, typeof data.payload.row>(
                      data.payload.row
                    )
                  );
                } else if (data.payload.table === 'contributor') {
                  historyData.contributor.push(
                    ensureExact<Insertable<ContributorTable<'realtime'>>, typeof data.payload.row>(
                      data.payload.row
                    )
                  );
                } else if (data.payload.table === 'series') {
                  historyData.series.push(
                    ensureExact<Insertable<SeriesTable<'realtime'>>, typeof data.payload.row>(
                      data.payload.row
                    )
                  );
                } else if (data.payload.table === 'book') {
                  historyData.book.push(
                    ensureExact<Insertable<BookTable<'realtime'>>, typeof data.payload.row>(
                      data.payload.row
                    )
                  );
                } else if (data.payload.table === 'bookSeries') {
                  historyData.bookSeries.push(
                    ensureExact<Insertable<BookSeriesTable<'realtime'>>, typeof data.payload.row>(
                      data.payload.row
                    )
                  );
                } else if (data.payload.table === 'bookContributor') {
                  historyData.bookContributor.push(
                    ensureExact<
                      Insertable<BookContributorTable<'realtime'>>,
                      typeof data.payload.row
                    >(data.payload.row)
                  );
                } else if (data.payload.table === 'audiobookFile') {
                  historyData.audiobookFile.push(
                    ensureExact<
                      Insertable<AudiobookFileTable<'realtime'>>,
                      typeof data.payload.row
                    >(data.payload.row)
                  );
                } else if (data.payload.table === 'audiobookChapter') {
                  historyData.audiobookChapter.push(
                    ensureExact<
                      Insertable<AudiobookChapterTable<'realtime'>>,
                      typeof data.payload.row
                    >(data.payload.row)
                  );
                } else if (data.payload.table === 'ebookFile') {
                  historyData.ebookFile.push(
                    ensureExact<Insertable<EBookFileTable<'realtime'>>, typeof data.payload.row>(
                      data.payload.row
                    )
                  );
                } else if (data.payload.table === 'playbackHistory') {
                  historyData.playbackHistory.push(
                    ensureExact<
                      Insertable<PlaybackHistoryTable<'realtime'>>,
                      typeof data.payload.row
                    >(data.payload.row)
                  );
                }

                if (historyData.rowCount % 100 === 0) {
                  await instanceDb.transaction().execute(async (trx) => {
                    await flushHistoryData(trx, historyData);
                  });
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                  instanceStore.trigger.setSyncStatus({ instanceId, status: 'waiting' });
                }
              } else if (data.type === 'historyComplete' && historyData.rowCount > 0) {
                await instanceDb.transaction().execute(async (trx) => {
                  await flushHistoryData(trx, historyData);
                });
                queryClient.invalidateQueries({ queryKey: ['instance'] });
                instanceStore.trigger.setSyncStatus({ instanceId, status: 'waiting' });
              } else if (data.type === 'live') {
                instanceStore.trigger.setSyncStatus({ instanceId, status: 'processing' });
                if (data.payload.table === 'library') {
                  await upsertLibrary(
                    instanceDb,
                    ensureExact<Insertable<LibraryTable<'realtime'>>[], typeof data.payload.rows>(
                      data.payload.rows
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'contributor') {
                  await upsertContributor(
                    instanceDb,
                    ensureExact<
                      Insertable<ContributorTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'series') {
                  await upsertSeries(
                    instanceDb,
                    ensureExact<Insertable<SeriesTable<'realtime'>>[], typeof data.payload.rows>(
                      data.payload.rows
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'book') {
                  await upsertBook(
                    instanceDb,
                    ensureExact<Insertable<BookTable<'realtime'>>[], typeof data.payload.rows>(
                      data.payload.rows
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'bookSeries') {
                  await upsertBookSeries(
                    instanceDb,
                    ensureExact<
                      Insertable<BookSeriesTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'bookContributor') {
                  await upsertBookContributor(
                    instanceDb,
                    ensureExact<
                      Insertable<BookContributorTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'audiobookFile') {
                  await upsertAudiobookFile(
                    instanceDb,
                    ensureExact<
                      Insertable<AudiobookFileTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'audiobookChapter') {
                  await upsertAudiobookChapter(
                    instanceDb,
                    ensureExact<
                      Insertable<AudiobookChapterTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'ebookFile') {
                  await upsertEBookFile(
                    instanceDb,
                    ensureExact<Insertable<EBookFileTable<'realtime'>>[], typeof data.payload.rows>(
                      data.payload.rows
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'playbackHistory') {
                  await upsertPlaybackHistory(
                    instanceDb,
                    ensureExact<
                      Insertable<PlaybackHistoryTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                }
                instanceStore.trigger.setSyncStatus({ instanceId, status: 'waiting' });
              }
            } catch (error) {
              if (data.type === 'live') {
                toast.error(`Error processing live data for ${data.payload.table}`, {
                  description: error instanceof Error ? error.message : 'Unknown error',
                });
              } else {
                toast.error(`Error processing history data`, {
                  description: error instanceof Error ? error.message : 'Unknown error',
                });
              }
              instanceStore.trigger.setSyncStatus({ instanceId, status: 'error' });
            }
          });
        },
        onError: (error) => {
          toast.error(`Error while subscribing to realtime changes`, {
            description: error instanceof Error ? error.message : 'Unknown error',
          });
          instanceStore.trigger.setSyncStatus({ instanceId, status: 'error' });
        },
        onConnectionStateChange: (result) => {
          switch (result.state) {
            case 'connecting':
              instanceStore.trigger.setSyncStatus({ instanceId, status: 'connecting' });
              break;
            case 'pending':
              instanceStore.trigger.setSyncStatus({ instanceId, status: 'waiting' });
              break;
            case 'idle':
              instanceStore.trigger.setSyncStatus({ instanceId, status: 'idle' });
              break;
          }
        },
      });

      instanceStore.trigger.setSyncUnsubscriber({ instanceId, syncUnsubscriber: unsubscribe });
    })
    .catch((error) => {
      toast.error(`Error while setting up realtime subscription`, {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    });
};

export const createInstances = (instanceId: string | null, instanceURL: string | null) => {
  const authInstance = createInstanceAuthClient(instanceId ?? '0', instanceURL ?? 'http://0.0.0.0');
  const apiInstance = createApiInstance(instanceURL ?? 'http://0.0.0.0', authInstance);

  const instanceOpDb = open({ name: `VoelInstance-${instanceId ?? '0'}.db` });

  const instanceDialect = new OpSqliteDialect({
    database: instanceOpDb,
    onCreateConnection: async (connection) => {
      connection.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = ON'));
      connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
      connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
    },
  });

  const instanceDb = new Kysely<InstanceDatabase>({
    dialect: instanceDialect,
  });

  createInstanceDbMigrator(instanceDb)
    .migrateToLatest()
    .then((results) => {
      if (results.error) {
        instanceStore.trigger.setMigrationStatus({
          instanceId: instanceId,
          status: 'error',
          error: results.error instanceof Error ? results.error : new Error('Unknown error'),
        });
      } else {
        instanceStore.trigger.setMigrationStatus({
          instanceId: instanceId,
          status: 'completed',
        });

        startRealtimeSync(instanceId, instanceDb, apiInstance);
      }
    })
    .catch((error) => {
      instanceStore.trigger.setMigrationStatus({
        instanceId: instanceId,
        status: 'error',
        error: error instanceof Error ? error : new Error('Unknown error'),
      });
    });

  return {
    authInstance,
    apiInstance,
    instanceDb,
    instanceOpDb,
    migrationStatus: 'pending',
    migrationError: null,
    sessionUnsubscribe: authInstance.$store.atoms.session.listen(
      async (
        value: ReturnType<
          ReturnType<
            typeof useAuthQuery<ReturnType<typeof createInstanceAuthClient>['$Infer']['Session']>
          >['get']
        >
      ) => {
        if (instanceURL && value.data && value.data.user.username) {
          const result = await mainDb
            .insertInto('accounts')
            .values({
              instanceURL: instanceURL,
              userId: value.data.user.id,
              username: value.data.user.username,
              email: value.data.user.email,
              name: value.data.user.name,
              image: value.data.user.image ?? undefined,
              role:
                value.data.user.role === 'admin'
                  ? 'admin'
                  : value.data.user.role === 'user'
                    ? 'user'
                    : 'under18',
              updatedAt: value.data.user.updatedAt.getTime(),
            })
            .onConflict((oc) =>
              oc
                .columns(['instanceURL', 'userId'])
                .doUpdateSet((eb) => ({
                  username: eb.ref('excluded.username'),
                  email: eb.ref('excluded.email'),
                  name: eb.ref('excluded.name'),
                  image: eb.ref('excluded.image'),
                  role: eb.ref('excluded.role'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                }))
                .where((eb) =>
                  eb.or([
                    eb('accounts.role', '!=', eb.ref('excluded.role')),
                    eb('accounts.updatedAt', '<', eb.ref('excluded.updatedAt')),
                  ])
                )
            )
            .executeTakeFirst();

          if (result.insertId === undefined) {
            queryClient.invalidateQueries();
          }
        }
      }
    ),
  } as {
    authInstance: ReturnType<typeof createInstanceAuthClient>;
    apiInstance: ReturnType<typeof createApiInstance>;
    instanceDb: Kysely<InstanceDatabase<'regular'>>;
    instanceOpDb: DB;
    sessionUnsubscribe: () => void;
  } & MigrationStatus;
};

export const createInstanceAuthClient = (instanceId: string, instanceURL: string) =>
  createAuthClient(instanceURL, `voel_${instanceId}`);

export const useAuthSession = (authClient: ReturnType<typeof createInstanceAuthClient>) =>
  authClient.useSession();

type MigrationStatusNoError = { migrationStatus: 'pending' | 'completed'; migrationError: null };
type MigrationStatusWithError = { migrationStatus: 'error'; migrationError: Error };
type MigrationStatus = MigrationStatusNoError | MigrationStatusWithError;

type SyncStatus = 'idle' | 'processing' | 'waiting' | 'connecting' | 'error';

export const instanceStore = createStore({
  context: {
    error: null as string | null,
    syncStatus: 'idle' as SyncStatus,
    syncUnsubscriber: () => {},
    instanceId: SecureStore.getItem('currentInstanceId'),
    instanceURL: SecureStore.getItem('currentInstanceURL'),
    instanceUserId: SecureStore.getItem('currentInstanceUserId'),
    ...createInstances(
      SecureStore.getItem('currentInstanceId'),
      SecureStore.getItem('currentInstanceURL')
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
      context.syncUnsubscriber();
      context.sessionUnsubscribe();
      Player.clearQueue();
      queryClient.resetQueries({ queryKey: context.apiInstance.pathKey() });

      SecureStore.setItem('currentInstanceId', event.instanceId);
      SecureStore.setItem('currentInstanceURL', event.instanceURL);
      SecureStore.setItem('currentInstanceUserId', event.instanceUserId);

      return {
        error: null,
        syncStatus: 'idle' as SyncStatus,
        syncUnsubscriber: () => {},
        instanceId: event.instanceId,
        instanceURL: event.instanceURL,
        instanceUserId: event.instanceUserId,
        ...createInstances(event.instanceId, event.instanceURL),
      };
    },
    setError: (context, { error }: { error: string }) => {
      return { ...context, error };
    },
    setSyncStatus: (
      context,
      { instanceId, status }: { instanceId: string | null; status: SyncStatus }
    ) => {
      if (context.instanceId === instanceId) {
        return { ...context, syncStatus: status };
      } else {
        return context;
      }
    },
    // There is no race condition due to `recreateAuthInstance` calling
    // `createInstances` which asynchronously calls when `setSyncUnsubscriber`
    // when ready, because xstate processes triggers sequentially.
    setSyncUnsubscriber: (
      context,
      { instanceId, syncUnsubscriber }: { instanceId: string | null; syncUnsubscriber: () => void }
    ) => {
      if (context.instanceId === instanceId) {
        context.syncUnsubscriber();
        return { ...context, syncUnsubscriber };
      } else {
        syncUnsubscriber();
        return context;
      }
    },
    setMigrationStatus: (
      context,
      event:
        | { instanceId: string | null; status: 'error'; error: Error }
        | { instanceId: string | null; status: 'completed' }
    ) => {
      if (context.instanceId === event.instanceId) {
        if (event.status === 'error') {
          return {
            ...context,
            migrationStatus: event.status,
            migrationError: event.error,
          };
        } else {
          return {
            ...context,
            migrationStatus: event.status,
            migrationError: null,
          };
        }
      } else {
        return context;
      }
    },
  },
});

export const useApiInstance = () =>
  useSelector(instanceStore, (state) => state.context.apiInstance);

export const useAuthInstance = () =>
  useSelector(instanceStore, (state) => state.context.authInstance);

export const useInstanceId = () =>
  useSelector(instanceStore, (state) => state.context.instanceId) ?? '0';

export const useInstanceURL = () =>
  useSelector(instanceStore, (state) => state.context.instanceURL) ?? 'http://0.0.0.0';

export const useInstanceDb = () => useSelector(instanceStore, (state) => state.context.instanceDb);
