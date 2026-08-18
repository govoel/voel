import { Array, Deferred, Effect, Fiber, Layer, Schema, Stream } from 'effect';

import { sql } from '@repo/effect-kysely';
import type { UnknownRow } from '@repo/effect-kysely';
import { Api } from '@repo/spec-api';
import type { ApiPayload } from '@repo/spec-api';
import { SyncEvent, syncStaticTables, syncTimestampedTables } from '@repo/spec-api/groups/sync.ts';
import type { SyncEvent as SyncEventType } from '@repo/spec-api/groups/sync.ts';

import { Database } from '#src/services/database/index.ts';

export const SyncHandlersNoDeps = Api.toLayerHandler('sync', (checkpoint: ApiPayload<'sync'>) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { db, sourceTap } = yield* Database;

      const decode = Schema.decodeUnknownEffect(SyncEvent);

      // The transaction begins before the subscription is acquired. The SourceTap
      // database has one connection, giving snapshot and live updates an atomic cutover.
      const transactionStarted = yield* Deferred.make<true>();
      const subscriptionReady = yield* Deferred.make<true>();
      const snapshot = yield* db
        .trx()
        .execute(
          Effect.fnUntraced(function* (trx) {
            yield* Deferred.succeed(transactionStarted, true);
            yield* Deferred.await(subscriptionReady);
            const events = yield* Effect.forEach(
              [
                ...syncStaticTables.map((table) => ({ table, cursor: null })),
                ...syncTimestampedTables.map((table) => ({ table, cursor: checkpoint[table] })),
              ],
              Effect.fnUntraced(function* ({ cursor, table }) {
                const result = yield* trx.executeRaw(
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
            return Array.flatten(events);
          })
        )
        .pipe(Effect.forkScoped);

      yield* Deferred.await(transactionStarted);
      const liveUpdates = yield* sourceTap.subscribe();
      yield* Deferred.succeed(subscriptionReady, true);
      const history = yield* Fiber.join(snapshot);

      return Stream.fromIterable(history).pipe(
        Stream.concat(
          Stream.succeed<SyncEventType>({
            type: 'historyComplete',
          })
        ),
        Stream.concat(
          liveUpdates.pipe(
            Stream.mapEffect((update) =>
              decode({
                type: 'live',
                payload: { table: update.table, rows: update.rows },
              }).pipe(Effect.orDie)
            )
          )
        )
      );
    })
  )
);

export const SyncHandlers = SyncHandlersNoDeps.pipe(Layer.provide(Database.layer));
