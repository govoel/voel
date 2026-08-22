import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { Cause } from 'effect';

import type { ApiPayload } from '@repo/spec-api';
import {
  SyncEvent,
  SyncRpcs,
  SyncSlowConsumerError,
  syncColumns,
} from '@repo/spec-api/groups/sync.ts';
import type { SyncEvent as SyncEventType, SyncRow } from '@repo/spec-api/groups/sync.ts';

import { Database } from '#src/services/database/index.ts';

const liveUpdateBufferCapacity = 1024;

type SyncTable = SyncRow['_tag'];
type SyncTableRow<Table extends SyncTable> = Omit<Extract<SyncRow, { _tag: Table }>, '_tag'>;

export const bufferLiveUpdates = Effect.fnUntraced(function* <A>(
  updates: Stream.Stream<A>,
  capacity: number
) {
  const queue = yield* Queue.dropping<A, SyncSlowConsumerError | Cause.Done>(capacity);

  yield* updates.pipe(
    Stream.runForEach(
      Effect.fnUntraced(function* (update) {
        if (!(yield* Queue.offer(queue, update))) {
          return yield* SyncSlowConsumerError.make({ capacity });
        }
        return void 0;
      })
    ),
    Effect.matchCauseEffect({
      onFailure: (cause) =>
        Queue.failCause(queue, cause).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
      onSuccess: () => Queue.end(queue),
    }),
    Effect.forkScoped({ startImmediately: true })
  );

  return Stream.fromQueue(queue);
});

export const SyncHandlersLayerNoDeps = SyncRpcs.toLayerHandler(
  'sync',
  (checkpoint: ApiPayload<'sync'>) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const { db, sourceTap } = yield* Database;

        const decode = Schema.decodeUnknownEffect(SyncEvent);

        /*
         * Sync intentionally subscribes before reading history instead of holding the
         * database's sole connection for an atomic snapshot/live cutover. History and
         * live updates can overlap, so a client may briefly replay an older full-row
         * upsert, but the ordered live updates make it converge again. This favors
         * database availability over transient consistency. Each subscription has a
         * bounded relay; if a reader cannot keep up, the stream fails explicitly and
         * the client reconnects from its persisted checkpoints instead of consuming
         * unbounded server memory.
         */
        const liveUpdates = yield* bufferLiveUpdates(sourceTap.updates, liveUpdateBufferCapacity);
        const mediaTypes = yield* db.execute(
          db.selectFrom('mediaType').select(syncColumns.mediaType)
        );
        const mediaItems = yield* db.execute(
          db
            .selectFrom('mediaItem')
            .select(syncColumns.mediaItem)
            .where('updatedAt', '>=', checkpoint.mediaItem)
            .orderBy('updatedAt')
        );
        const audiobooks = yield* db.execute(
          db
            .selectFrom('audiobook')
            .select(syncColumns.audiobook)
            .where('updatedAt', '>=', checkpoint.audiobook)
            .orderBy('updatedAt')
        );
        const audiobookSeries = yield* db.execute(
          db
            .selectFrom('audiobookSeries')
            .select(syncColumns.audiobookSeries)
            .where('updatedAt', '>=', checkpoint.audiobookSeries)
            .orderBy('updatedAt')
        );
        const audiobookSeriesMaps = yield* db.execute(
          db
            .selectFrom('audiobookSeriesMap')
            .select(syncColumns.audiobookSeriesMap)
            .where('updatedAt', '>=', checkpoint.audiobookSeriesMap)
            .orderBy('updatedAt')
        );
        const audiobookContributors = yield* db.execute(
          db
            .selectFrom('audiobookContributor')
            .select(syncColumns.audiobookContributor)
            .where('updatedAt', '>=', checkpoint.audiobookContributor)
            .orderBy('updatedAt')
        );
        const audiobookContributorRoles = yield* db.execute(
          db.selectFrom('audiobookContributorRole').select(syncColumns.audiobookContributorRole)
        );
        const audiobookContributorMaps = yield* db.execute(
          db
            .selectFrom('audiobookContributorMap')
            .select(syncColumns.audiobookContributorMap)
            .where('updatedAt', '>=', checkpoint.audiobookContributorMap)
            .orderBy('updatedAt')
        );
        const libraries = yield* db.execute(
          db
            .selectFrom('library')
            .select(syncColumns.library)
            .where('updatedAt', '>=', checkpoint.library)
            .orderBy('updatedAt')
        );
        const libraryPaths = yield* db.execute(
          db
            .selectFrom('libraryPath')
            .select(syncColumns.libraryPath)
            .where('updatedAt', '>=', checkpoint.libraryPath)
            .orderBy('updatedAt')
        );
        const mediaFiles = yield* db.execute(
          db
            .selectFrom('mediaFile')
            .select(syncColumns.mediaFile)
            .where('updatedAt', '>=', checkpoint.mediaFile)
            .orderBy('updatedAt')
        );
        const libraryFileMaps = yield* db.execute(
          db
            .selectFrom('libraryFileMap')
            .select(syncColumns.libraryFileMap)
            .where('updatedAt', '>=', checkpoint.libraryFileMap)
            .orderBy('updatedAt')
        );

        const selectedHistory = {
          mediaType: mediaTypes,
          mediaItem: mediaItems,
          audiobook: audiobooks,
          audiobookSeries,
          audiobookSeriesMap: audiobookSeriesMaps,
          audiobookContributor: audiobookContributors,
          audiobookContributorRole: audiobookContributorRoles,
          audiobookContributorMap: audiobookContributorMaps,
          library: libraries,
          libraryPath: libraryPaths,
          mediaFile: mediaFiles,
          libraryFileMap: libraryFileMaps,
        } satisfies {
          [Table in SyncTable]: ReadonlyArray<SyncTableRow<Table>>;
        };

        const history = yield* Effect.all(
          [
            ...selectedHistory.mediaType.map((row) => ({ _tag: 'mediaType' as const, ...row })),
            ...selectedHistory.mediaItem.map((row) => ({ _tag: 'mediaItem' as const, ...row })),
            ...selectedHistory.audiobook.map((row) => ({ _tag: 'audiobook' as const, ...row })),
            ...selectedHistory.audiobookSeries.map((row) => ({
              _tag: 'audiobookSeries' as const,
              ...row,
            })),
            ...selectedHistory.audiobookSeriesMap.map((row) => ({
              _tag: 'audiobookSeriesMap' as const,
              ...row,
            })),
            ...selectedHistory.audiobookContributor.map((row) => ({
              _tag: 'audiobookContributor' as const,
              ...row,
            })),
            ...selectedHistory.audiobookContributorRole.map((row) => ({
              _tag: 'audiobookContributorRole' as const,
              ...row,
            })),
            ...selectedHistory.audiobookContributorMap.map((row) => ({
              _tag: 'audiobookContributorMap' as const,
              ...row,
            })),
            ...selectedHistory.library.map((row) => ({ _tag: 'library' as const, ...row })),
            ...selectedHistory.libraryPath.map((row) => ({
              _tag: 'libraryPath' as const,
              ...row,
            })),
            ...selectedHistory.mediaFile.map((row) => ({ _tag: 'mediaFile' as const, ...row })),
            ...selectedHistory.libraryFileMap.map((row) => ({
              _tag: 'libraryFileMap' as const,
              ...row,
            })),
          ].map((payload) => decode({ type: 'history', payload }).pipe(Effect.orDie))
        );

        return Stream.fromIterable(history).pipe(
          Stream.concat(
            Stream.succeed<SyncEventType>({
              type: 'historyComplete',
            })
          ),
          Stream.concat(
            liveUpdates.pipe(
              Stream.flatMap((update) =>
                Stream.fromIterable(
                  update.rows.map((row) => ({
                    type: 'live' as const,
                    payload: { _tag: update.table, ...row },
                  }))
                )
              ),
              Stream.mapEffect((event) => decode(event).pipe(Effect.orDie))
            )
          )
        );
      })
    )
);

export const SyncHandlersLayer = SyncHandlersLayerNoDeps.pipe(Layer.provide(Database.layer));
