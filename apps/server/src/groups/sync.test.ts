/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Layer, Option, PubSub, Stream } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { sql } from '@repo/effect-kysely';
import { MediaFile, MediaType } from '@repo/spec-api/database/schema.ts';
import { LibraryRpcs } from '@repo/spec-api/groups/library.ts';
import type { SyncEvent } from '@repo/spec-api/groups/sync.ts';
import {
  SyncCheckpoint,
  SyncRpcs,
  SyncSlowConsumerError,
  syncColumns,
  syncPrimaryKeys,
  syncTables,
} from '@repo/spec-api/groups/sync.ts';

import { LibraryHandlersLayerNoDeps } from '#src/groups/library.ts';
import { SyncHandlersLayerNoDeps, bufferLiveUpdates } from '#src/groups/sync.ts';
import { makeAuthedClient } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

const TestLayer = Layer.mergeAll(LibraryHandlersLayerNoDeps, SyncHandlersLayerNoDeps).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps)),
  Layer.provideMerge(AuthLayerNoDeps),
  Layer.provideMerge(Database.layerNoDeps),
  Layer.provide([ApiConfig.layerTest(), BunPath.layer])
);

const emptyCheckpointFields = {
  mediaItem: 0,
  audiobook: 0,
  audiobookSeries: 0,
  audiobookSeriesMap: 0,
  audiobookContributor: 0,
  audiobookContributorMap: 0,
  library: 0,
  libraryPath: 0,
  mediaFile: 0,
  libraryFileMap: 0,
};
const emptyCheckpoints = SyncCheckpoint.make(emptyCheckpointFields);

it.effect(
  'starts consuming live updates before returning the buffered stream',
  Effect.fnUntraced(function* () {
    const pubsub = yield* PubSub.unbounded<number>();
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

    const updates = yield* bufferLiveUpdates(Stream.fromPubSub(pubsub), 1);
    yield* PubSub.publish(pubsub, 1);

    expect(yield* Stream.runHead(updates)).toEqual(Option.some(1));
  })
);

it.effect(
  'fails an overflowed live update stream without interrupting history',
  Effect.fnUntraced(function* () {
    const updates = yield* bufferLiveUpdates(Stream.make(1, 2), 1);
    const received: Array<number> = [];
    const error = yield* Stream.make(0).pipe(
      Stream.concat(updates),
      Stream.runForEach((event) =>
        Effect.sync(() => {
          received.push(event);
        })
      ),
      Effect.flip
    );

    expect(received).toEqual([0]);
    expect(error).toEqual(SyncSlowConsumerError.make({ capacity: 1 }));
  })
);

it.layer(TestLayer)('sync', (iit) => {
  iit.effect(
    'keeps sync projections aligned with the physical server tables',
    Effect.fnUntraced(function* () {
      const { db } = yield* Database;

      for (const table of syncTables) {
        const result = yield* db.executeRaw(
          sql<{ readonly name: string; readonly pk: number }>`
            select name, pk from pragma_table_info(${table})
            order by cid
          `
        );
        expect(
          result.rows.map((column) => column.name).toSorted((a, b) => a.localeCompare(b))
        ).toEqual(syncColumns[table].toSorted((a, b) => a.localeCompare(b)));
        expect(
          result.rows
            .filter((column) => column.pk > 0)
            .toSorted((a, b) => a.pk - b.pk)
            .map((column) => column.name)
        ).toEqual([syncPrimaryKeys[table]]);
      }
    })
  );

  iit.effect(
    'streams ordered history followed by committed live updates',
    Effect.fnUntraced(function* () {
      const authLayer = yield* makeAuthedClient({ username: 'sync.admin', role: 'admin' });
      const libraryClient = yield* RpcTest.makeClient(LibraryRpcs).pipe(Effect.provide(authLayer));
      const syncClient = yield* RpcTest.makeClient(SyncRpcs).pipe(Effect.provide(authLayer));
      const library = yield* libraryClient.libraryUpsert({
        id: Option.none(),
        type: MediaType.fields.type.make('audiobook'),
        name: 'History library',
        absolutePaths: [],
      });
      const history = yield* syncClient.sync(emptyCheckpoints).pipe(
        Stream.takeUntil((event) => event.type === 'historyComplete'),
        Stream.runCollect
      );

      expect(history.at(-1)).toEqual({ type: 'historyComplete' });
      const libraryHistory = history.find(
        (event) => event.type === 'history' && event.payload._tag === 'library'
      );
      expect(libraryHistory?.type === 'history' && libraryHistory.payload).toMatchObject({
        id: library.id,
        name: 'History library',
      });
      if (libraryHistory?.type !== 'history' || libraryHistory.payload._tag !== 'library') {
        return yield* Effect.die('Expected library history');
      }
      expect(history.filter((event) => event.type === 'history').slice(0, 3)).toMatchObject([
        { payload: { _tag: 'mediaType' } },
        { payload: { _tag: 'mediaType' } },
        { payload: { _tag: 'mediaType' } },
      ]);

      const checkpointedHistory = yield* syncClient
        .sync(
          SyncCheckpoint.make({
            ...emptyCheckpointFields,
            library: libraryHistory.payload.updatedAt + 1,
          })
        )
        .pipe(
          Stream.takeUntil((event) => event.type === 'historyComplete'),
          Stream.runCollect
        );
      expect(
        checkpointedHistory.some(
          (event) => event.type === 'history' && event.payload._tag === 'library'
        )
      ).toBe(false);

      const historyComplete = yield* Deferred.make<true>();
      const liveEvent = yield* Deferred.make<SyncEvent>();
      yield* syncClient.sync(emptyCheckpoints).pipe(
        Stream.runForEach((event) => {
          if (event.type === 'historyComplete') {
            return Deferred.succeed(historyComplete, true);
          }
          if (event.type === 'live' && event.payload._tag === 'library') {
            return Deferred.succeed(liveEvent, event);
          }
          return Effect.void;
        }),
        Effect.forkChild
      );
      yield* Deferred.await(historyComplete);

      yield* libraryClient.libraryUpsert({
        id: Option.none(),
        type: MediaType.fields.type.make('movie'),
        name: 'Live library',
        absolutePaths: [],
      });

      expect(yield* Deferred.await(liveEvent)).toMatchObject({
        type: 'live',
        payload: {
          _tag: 'library',
          name: 'Live library',
        },
      });
      return void 0;
    })
  );

  iit.effect(
    'advances the media file checkpoint when a row changes',
    Effect.fnUntraced(function* () {
      const { db } = yield* Database;
      yield* db.executeRaw(sql`
        insert into mediaFile (absolutePath, durationMs, createdAt, updatedAt, deletedAt)
        values ('/sync/media.mp3', 1, 0, 0, null)
      `);
      yield* db.executeRaw(
        sql`update mediaFile set durationMs = 2 where absolutePath = '/sync/media.mp3'`
      );
      const row = yield* db.executeTakeFirstOrError(
        db
          .selectFrom('mediaFile')
          .selectAll()
          .where('absolutePath', '=', MediaFile.fields.absolutePath.make('/sync/media.mp3'))
      );
      expect(row.updatedAt).toBeGreaterThan(0);
    })
  );
});
