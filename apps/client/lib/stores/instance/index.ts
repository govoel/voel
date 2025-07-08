import { expoClient } from '@better-auth/expo/client';
import { open } from '@op-engineering/op-sqlite';
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { auth } from '@voel/server/src/libs/auth/auth';
import type { AppRouter } from '@voel/server/src/router/root';
import { createStore } from '@xstate/store';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { toast } from 'sonner-native';

import { queryClient } from '~/lib/api/query-client';

import '@azure/core-asynciterator-polyfill';

import type { DB } from '@op-engineering/op-sqlite';
import { CompiledQuery, type Insertable, Kysely, type Transaction } from 'kysely';

import { OpSqliteDialect } from '~/db/driver';
import { createInstanceDbMigrator } from '~/db/migrations/instance';
import type {
  AudiobookChapterTable,
  AudiobookFileTable,
  AuthorTable,
  BookAuthorTable,
  BookContributorTable,
  BookSeriesTable,
  BookTable,
  EBookFileTable,
  InstanceDatabase,
  LibraryTable,
  PlaybackHistoryTable,
  SeriesTable,
} from '~/db/schema/instance';

import { ExpoEventSource } from '~/lib/stores/instance/EventSource';

import Player from '~/modules/voel-audio';

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
      .selectFrom('author')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('authorUpdatedAt'))
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
      .selectFrom('bookAuthor')
      .select((eb) => eb.fn.max<number | null>('updatedAt').as('bookAuthorUpdatedAt'))
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
        author: results[1].authorUpdatedAt ?? 0,
        series: results[2].seriesUpdatedAt ?? 0,
        book: results[3].bookUpdatedAt ?? 0,
        bookAuthor: results[4].bookAuthorUpdatedAt ?? 0,
        bookSeries: results[5].bookSeriesUpdatedAt ?? 0,
        bookContributor: results[6].bookContributorUpdatedAt ?? 0,
        audiobookFile: results[7].audiobookFileUpdatedAt ?? 0,
        audiobookChapter: results[8].audiobookChapterUpdatedAt ?? 0,
        ebookFile: results[9].ebookFileUpdatedAt ?? 0,
        playbackHistory: results[10].playbackHistoryUpdatedAt ?? 0,
      });

      let queue = Promise.resolve();

      const historyData = {
        rowCount: 0,
        library: [] as Insertable<LibraryTable<'realtime'>>[],
        author: [] as Insertable<AuthorTable<'realtime'>>[],
        series: [] as Insertable<SeriesTable<'realtime'>>[],
        book: [] as Insertable<BookTable<'realtime'>>[],
        bookAuthor: [] as Insertable<BookAuthorTable<'realtime'>>[],
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
                } else if (data.payload.table === 'author') {
                  historyData.author.push(
                    ensureExact<Insertable<AuthorTable<'realtime'>>, typeof data.payload.row>(
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
                } else if (data.payload.table === 'bookAuthor') {
                  historyData.bookAuthor.push(
                    ensureExact<Insertable<BookAuthorTable<'realtime'>>, typeof data.payload.row>(
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
                } else if (data.payload.table === 'author') {
                  await upsertAuthor(
                    instanceDb,
                    ensureExact<Insertable<AuthorTable<'realtime'>>[], typeof data.payload.rows>(
                      data.payload.rows
                    )
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
                } else if (data.payload.table === 'bookAuthor') {
                  await upsertBookAuthor(
                    instanceDb,
                    ensureExact<
                      Insertable<BookAuthorTable<'realtime'>>[],
                      typeof data.payload.rows
                    >(data.payload.rows)
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
      connection.executeQuery(CompiledQuery.raw(`PRAGMA foreign_keys = ON`));
      connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
      connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
    },
  });

  const instanceDb = new Kysely<InstanceDatabase>({ dialect: instanceDialect });

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
  } as {
    authInstance: ReturnType<typeof createInstanceAuthClient>;
    apiInstance: ReturnType<typeof createApiInstance>;
    instanceDb: Kysely<InstanceDatabase<'regular'>>;
    instanceOpDb: DB;
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

const upsertLibrary = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<LibraryTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('library')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        name: (eb) => eb.ref('excluded.name'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertAuthor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<AuthorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('author')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        asin: (eb) => eb.ref('excluded.asin'),
        name: (eb) => eb.ref('excluded.name'),
        about: (eb) => eb.ref('excluded.about'),
        avatar: (eb) => eb.ref('excluded.avatar'),
        avatarThumbhash: (eb) => eb.ref('excluded.avatarThumbhash'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertSeries = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<SeriesTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('series')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        asin: (eb) => eb.ref('excluded.asin'),
        name: (eb) => eb.ref('excluded.name'),
        summary: (eb) => eb.ref('excluded.summary'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertBook = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('book')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        asin: (eb) => eb.ref('excluded.asin'),
        type: (eb) => eb.ref('excluded.type'),
        otherTypeId: (eb) => eb.ref('excluded.otherTypeId'),
        title: (eb) => eb.ref('excluded.title'),
        subtitle: (eb) => eb.ref('excluded.subtitle'),
        cover: (eb) => eb.ref('excluded.cover'),
        coverThumbhash: (eb) => eb.ref('excluded.coverThumbhash'),
        summary: (eb) => eb.ref('excluded.summary'),
        adultsOnly: (eb) => eb.ref('excluded.adultsOnly'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertBookAuthor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookAuthorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('bookAuthor')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        authorId: (eb) => eb.ref('excluded.authorId'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertBookSeries = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookSeriesTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('bookSeries')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        seriesId: (eb) => eb.ref('excluded.seriesId'),
        label: (eb) => eb.ref('excluded.label'),
        sort: (eb) => eb.ref('excluded.sort'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertBookContributor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookContributorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('bookContributor')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        name: (eb) => eb.ref('excluded.name'),
        role: (eb) => eb.ref('excluded.role'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertAudiobookFile = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<AudiobookFileTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('audiobookFile')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        libraryId: (eb) => eb.ref('excluded.libraryId'),
        bookId: (eb) => eb.ref('excluded.bookId'),
        path: (eb) => eb.ref('excluded.path'),
        durationMs: (eb) => eb.ref('excluded.durationMs'),
        disc: (eb) => eb.ref('excluded.disc'),
        track: (eb) => eb.ref('excluded.track'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertAudiobookChapter = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<AudiobookChapterTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('audiobookChapter')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        parentId: (eb) => eb.ref('excluded.parentId'),
        source: (eb) => eb.ref('excluded.source'),
        title: (eb) => eb.ref('excluded.title'),
        durationMs: (eb) => eb.ref('excluded.durationMs'),
        startOffsetMs: (eb) => eb.ref('excluded.startOffsetMs'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertEBookFile = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<EBookFileTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('ebookFile')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        libraryId: (eb) => eb.ref('excluded.libraryId'),
        bookId: (eb) => eb.ref('excluded.bookId'),
        path: (eb) => eb.ref('excluded.path'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertPlaybackHistory = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<PlaybackHistoryTable<'realtime'>>[]
) => {
  return (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('playbackHistory')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        userId: (eb) => eb.ref('excluded.userId'),
        type: (eb) => eb.ref('excluded.type'),
        bookId: (eb) => eb.ref('excluded.bookId'),
        positionMs: (eb) => eb.ref('excluded.positionMs'),
        eventTimestampMs: (eb) => eb.ref('excluded.eventTimestampMs'),
        sessionId: (eb) => eb.ref('excluded.sessionId'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();
};

const flushHistoryData = async (
  trx: Transaction<InstanceDatabase<'regular'>>,
  history: {
    rowCount: number;
    library: Insertable<LibraryTable<'realtime'>>[];
    author: Insertable<AuthorTable<'realtime'>>[];
    series: Insertable<SeriesTable<'realtime'>>[];
    book: Insertable<BookTable<'realtime'>>[];
    bookAuthor: Insertable<BookAuthorTable<'realtime'>>[];
    bookSeries: Insertable<BookSeriesTable<'realtime'>>[];
    bookContributor: Insertable<BookContributorTable<'realtime'>>[];
    audiobookFile: Insertable<AudiobookFileTable<'realtime'>>[];
    audiobookChapter: Insertable<AudiobookChapterTable<'realtime'>>[];
    ebookFile: Insertable<EBookFileTable<'realtime'>>[];
    playbackHistory: Insertable<PlaybackHistoryTable<'realtime'>>[];
  }
) => {
  if (history.library.length > 0) {
    await upsertLibrary(trx, history.library);
  }
  if (history.author.length > 0) {
    await upsertAuthor(trx, history.author);
  }
  if (history.series.length > 0) {
    await upsertSeries(trx, history.series);
  }
  if (history.book.length > 0) {
    await upsertBook(trx, history.book);
  }
  if (history.bookAuthor.length > 0) {
    await upsertBookAuthor(trx, history.bookAuthor);
  }
  if (history.bookSeries.length > 0) {
    await upsertBookSeries(trx, history.bookSeries);
  }
  if (history.bookContributor.length > 0) {
    await upsertBookContributor(trx, history.bookContributor);
  }
  if (history.audiobookFile.length > 0) {
    await upsertAudiobookFile(trx, history.audiobookFile);
  }
  if (history.audiobookChapter.length > 0) {
    await upsertAudiobookChapter(trx, history.audiobookChapter);
  }
  if (history.ebookFile.length > 0) {
    await upsertEBookFile(trx, history.ebookFile);
  }
  if (history.playbackHistory.length > 0) {
    await upsertPlaybackHistory(trx, history.playbackHistory);
  }
  history.library = [];
  history.author = [];
  history.series = [];
  history.book = [];
  history.bookAuthor = [];
  history.bookSeries = [];
  history.bookContributor = [];
  history.audiobookFile = [];
  history.audiobookChapter = [];
  history.ebookFile = [];
  history.playbackHistory = [];
  history.rowCount = 0;
};

type Exact<TKnown, T extends TKnown> = {
  [Key in keyof T]: Key extends keyof TKnown
    ? T[Key] extends unknown[]
      ? Exclude<T[Key], undefined>
      : T[Key] extends object
        ? Exact<Exclude<TKnown[Key], undefined>, Exclude<T[Key], undefined>>
        : Exclude<T[Key], undefined>
    : never;
};

const ensureExact = <TKnown, TUnknown extends TKnown>(t: Exact<TKnown, TUnknown>) => t as TKnown;
