import { Array, Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { Cause } from 'effect';

import { sql } from '@repo/effect-kysely';
import type { UnknownRow } from '@repo/effect-kysely';
import type { ApiPayload } from '@repo/spec-api';
import {
  SyncEvent,
  SyncRpcs,
  SyncSlowConsumerError,
  syncStaticTables,
  syncTimestampedTables,
} from '@repo/spec-api/groups/sync.ts';
import type { SyncEvent as SyncEventType } from '@repo/spec-api/groups/sync.ts';

import { Database } from '#src/services/database/index.ts';

const liveUpdateBufferCapacity = 1024;

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
        const events = yield* Effect.forEach(
          [
            ...syncStaticTables.map((table) => ({ table, cursor: null })),
            ...syncTimestampedTables.map((table) => ({ table, cursor: checkpoint[table] })),
          ],
          Effect.fnUntraced(function* ({ cursor, table }) {
            const result = yield* db.executeRaw(
              cursor === null
                ? sql<UnknownRow>`select * from ${sql.table(table)}`
                : sql<UnknownRow>`
                  select * from ${sql.table(table)}
                  where updatedAt >= ${cursor}
                  order by updatedAt
                `
            );
            return yield* Effect.all(
              result.rows.map((row) =>
                decode({ type: 'history', payload: { table, row } }).pipe(Effect.orDie)
              )
            );
          })
        );
        const history = Array.flatten(events);

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
                    payload: { table: update.table, row },
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
