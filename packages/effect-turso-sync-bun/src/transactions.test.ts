/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem, Layer } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlError } from 'effect/sql';
import type { SqlClient } from 'effect/sql';
import { vi } from 'vitest';

import { TursoClient } from '@repo/effect-turso';

import { TursoSyncClient } from '#src/index.ts';

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);
const drivers = [
  {
    name: 'pooled Turso',
    make: (filename: string) =>
      TursoClient.make({ filename, minConnections: 1, maxConnections: 1 }),
  },
  { name: 'in-memory Turso', make: () => TursoClient.make({ filename: ':memory:' }) },
  { name: 'Bun Turso Sync', make: (filename: string) => TursoSyncClient.make({ path: filename }) },
];

const setup = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    yield* sql`
      pragma foreign_keys = on
    `;
    yield* sql`
      create table parent (id integer primary key)
    `;
    yield* sql`
      create table child (
        id integer primary key,
        parent_id integer references parent (id) deferrable initially deferred
      )
    `;
  });

for (const driver of drivers) {
  describe(driver.name, () => {
    const make = Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const sql: SqlClient.SqlClient = yield* driver.make(`${dir}/transactions.db`);
      yield* setup(sql);
      return sql;
    });

    it.effect('rolls back failed COMMIT before ordinary reads and subsequent transactions', () =>
      Effect.gen(function* () {
        const sql = yield* make;
        const failed = yield* sql
          .withTransaction(
            sql`
              insert into
                parent
              values
                (1)
            `.pipe(
              Effect.andThen(sql`
                insert into
                  child
                values
                  (1, 999)
              `)
            )
          )
          .pipe(Effect.exit);
        expect(Exit.isFailure(failed)).toBe(true);
        expect(
          yield* sql`
            select
              *
            from
              parent
          `
        ).toEqual([]);
        expect(
          yield* sql`
            select
              *
            from
              child
          `
        ).toEqual([]);

        // Valid deferred ownership succeeds, including child-first provisioning.
        yield* sql.withTransaction(
          sql`
            insert into
              child
            values
              (2, 2)
          `.pipe(
            Effect.andThen(sql`
              insert into
                parent
              values
                (2)
            `)
          )
        );
        expect(
          yield* sql`
            select
              *
            from
              child
          `
        ).toEqual([{ id: 2, parent_id: 2 }]);
      }).pipe(Effect.provide(TestLayer))
    );

    it.effect('rejects a poisoned connection until rollback succeeds without reopening it', () =>
      Effect.gen(function* () {
        const sql = yield* make;
        const connection = yield* Effect.scoped(sql.reserve);
        const execute = connection.executeUnprepared;
        let failures = 2;
        const cleanupError = SqlError.SqlError.make({
          reason: SqlError.ConnectionError.make({
            cause: new Error('Injected rollback failure'),
            message: 'Injected rollback failure',
          }),
        });
        const spy = vi
          .spyOn(connection, 'executeUnprepared')
          .mockImplementation((statement, params, transformRows) => {
            if (statement === 'ROLLBACK' && failures > 0) {
              failures -= 1;
              return Effect.fail(cleanupError);
            }
            return execute(statement, params, transformRows);
          });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            spy.mockRestore();
          })
        );

        const failed = yield* sql
          .withTransaction(
            sql`
              insert into
                parent
              values
                (1)
            `.pipe(
              Effect.andThen(sql`
                insert into
                  child
                values
                  (1, 999)
              `)
            )
          )
          .pipe(Effect.exit);
        expect(Exit.isFailure(failed)).toBe(true);
        if (Exit.isFailure(failed)) {
          expect(Cause.pretty(failed.cause)).toContain('Injected rollback failure');
          expect(Cause.pretty(failed.cause).toLowerCase()).toContain('foreign key');
        }

        const unavailable = yield* sql`
          select
            *
          from
            parent
        `.pipe(Effect.result);
        expect(unavailable).toMatchObject({
          _tag: 'Failure',
          failure: { _tag: 'SqlError', reason: { _tag: 'ConnectionError' } },
        });
        expect(
          yield* sql`
            select
              *
            from
              parent
          `
        ).toEqual([]);
        yield* sql`
          insert into
            parent
          values
            (2)
        `.pipe(sql.withTransaction);
        expect(
          yield* sql`
            select
              *
            from
              parent
          `
        ).toEqual([{ id: 2 }]);
      }).pipe(Effect.provide(TestLayer))
    );

    it.effect('does not roll back an already-ended transaction after COMMIT fails', () =>
      Effect.gen(function* () {
        const sql = yield* make;
        const connection = yield* Effect.scoped(sql.reserve);
        const execute = connection.executeUnprepared;
        const controls: Array<string> = [];
        const spy = vi
          .spyOn(connection, 'executeUnprepared')
          .mockImplementation((statement, params, transformRows) => {
            controls.push(statement);
            return execute(statement, params, transformRows);
          });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            spy.mockRestore();
          })
        );

        const failed = yield* sql
          .withTransaction(connection.executeUnprepared('ROLLBACK', [], void 0))
          .pipe(Effect.exit);
        expect(Exit.isFailure(failed)).toBe(true);
        // One explicit rollback, not another failed cleanup and extra error.
        expect(controls.filter((statement) => statement === 'ROLLBACK')).toHaveLength(1);
        yield* sql`
          insert into
            parent
          values
            (1)
        `.pipe(sql.withTransaction);
        expect(
          yield* sql`
            select
              *
            from
              parent
          `
        ).toEqual([{ id: 1 }]);
      }).pipe(Effect.provide(TestLayer))
    );

    it.effect('releases nested savepoints after both success and rollback', () =>
      Effect.gen(function* () {
        const sql = yield* make;
        const connection = yield* Effect.scoped(sql.reserve);
        const execute = connection.executeUnprepared;
        const releases: Array<string> = [];
        const spy = vi
          .spyOn(connection, 'executeUnprepared')
          .mockImplementation((statement, params, transformRows) => {
            if (statement.startsWith('RELEASE SAVEPOINT')) {
              releases.push(statement);
            }
            return execute(statement, params, transformRows);
          });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            spy.mockRestore();
          })
        );

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              insert into
                parent
              values
                (1)
            `.pipe(sql.withTransaction);
            yield* sql`
              insert into
                parent
              values
                (2)
            `.pipe(Effect.andThen(Effect.fail('nested failure')), sql.withTransaction, Effect.flip);
            yield* sql`
              insert into
                parent
              values
                (3)
            `;
          })
        );
        expect(releases).toHaveLength(2);
        expect(
          yield* sql`
            select
              *
            from
              parent
            order by
              id
          `
        ).toEqual([{ id: 1 }, { id: 3 }]);
      }).pipe(Effect.provide(TestLayer))
    );

    it.effect('keeps the connection leased until interrupted cleanup finishes', () =>
      Effect.gen(function* () {
        const sql = yield* make;
        const connection = yield* Effect.scoped(sql.reserve);
        const execute = connection.executeUnprepared;
        const entered = yield* Deferred.make<true>();
        const release = yield* Deferred.make<true>();
        const spy = vi
          .spyOn(connection, 'executeUnprepared')
          .mockImplementation((statement, params, transformRows) =>
            statement === 'ROLLBACK'
              ? Deferred.succeed(entered, true).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(execute(statement, params, transformRows))
                )
              : execute(statement, params, transformRows)
          );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            spy.mockRestore();
          })
        );

        const transaction = yield* sql
          .withTransaction(sql`
            insert into
              child
            values
              (1, 999)
          `)
          .pipe(Effect.exit, Effect.forkChild);
        yield* Deferred.await(entered);
        yield* Effect.gen(function* () {
          yield* Fiber.interrupt(transaction).pipe(Effect.forkChild);
          const reading = yield* Deferred.make<true>();
          const reader = yield* Deferred.succeed(reading, true).pipe(
            Effect.andThen(sql`
              select
                *
              from
                child
            `),
            Effect.forkChild
          );
          yield* Deferred.await(reading);
          yield* Effect.yieldNow;
          expect(reader.pollUnsafe()).toBe(void 0);
          yield* Deferred.succeed(release, true);
          yield* Fiber.await(transaction);
          expect(yield* Fiber.join(reader)).toEqual([]);
        }).pipe(Effect.ensuring(Deferred.succeed(release, true)));
      }).pipe(Effect.provide(TestLayer))
    );
  });
}
