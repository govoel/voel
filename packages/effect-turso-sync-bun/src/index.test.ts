/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { Database } from '@tursodatabase/sync';
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem, Layer, Option, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError } from 'effect/unstable/sql';
import { vi } from 'vitest';

import { TursoSyncClient } from '#src/index.ts';

const decodeRunInfo = Schema.decodeUnknownSync(
  Schema.Struct({ changes: Schema.Int, lastInsertRowid: Schema.Int })
);

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

const makeTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped();
});

describe('TursoSyncClient', () => {
  it.effect('initializes once with the SQL client before returning it', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      let calls = 0;
      const sql = yield* TursoSyncClient.make({
        path: `${dir}/local.db`,
        onConnect: (client) =>
          Effect.gen(function* () {
            calls += 1;
            yield* client`PRAGMA foreign_keys = ON`;
            yield* client`PRAGMA busy_timeout = 10000`;
            yield* client`create table initialized (value text not null)`;
            yield* client.withTransaction(client`
              insert into
                initialized
              values
                (${'ready'})
            `);
          }),
      });

      expect(
        yield* sql`
          pragma foreign_keys
        `
      ).toEqual([{ foreign_keys: 1 }]);
      expect(
        yield* sql`
          pragma busy_timeout
        `
      ).toEqual([{ busy_timeout: 10_000 }]);
      expect(
        yield* sql`
          select
            *
          from
            initialized
        `
      ).toEqual([{ value: 'ready' }]);
      expect(calls).toBe(1);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('fails construction and closes the connection when initialization fails', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const close = yield* Effect.acquireRelease(
        Effect.sync(() => vi.spyOn(Database.prototype, 'close')),
        (spy) =>
          Effect.sync(() => {
            spy.mockRestore();
          })
      );
      const error = yield* TursoSyncClient.make({
        path: `${dir}/local.db`,
        // oxlint-disable-next-line sql/format -- malformed intentionally to exercise syntax errors
        onConnect: (sql) => sql`SELEC 1`.pipe(Effect.asVoid),
      }).pipe(Effect.scoped, Effect.flip);

      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('SqlSyntaxError');
      expect(close).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('executes queries and transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      const created = yield* sql`
        create table test (id integer primary key, name text)
      `;
      expect(created).toEqual([]);
      const inserted = yield* sql`
        insert into
          test (name)
        values
          ('hello')
      `;
      expect(inserted).toEqual([]);
      const selected = yield* sql`
        select
          *
        from
          test
      `;
      expect(selected).toEqual([{ id: 1, name: 'hello' }]);
      const values = yield* sql`
        select
          *
        from
          test
      `.valuesUnprepared;
      expect(values).toEqual([[1, 'hello']]);
      const insertedInTxn = yield* sql`
        insert into
          test (name)
        values
          ('world')
      `.pipe(sql.withTransaction);
      expect(insertedInTxn).toEqual([]);
      const allRows = yield* sql`
        select
          *
        from
          test
      `;
      expect(allRows).toEqual([
        { id: 1, name: 'hello' },
        { id: 2, name: 'world' },
      ]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('returns raw run info', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key autoincrement, name text)
      `;
      const first = decodeRunInfo(
        yield* sql`
          insert into
            test (name)
          values
            ('hello')
        `.raw
      );
      expect(first.changes).toBe(1);
      const second = decodeRunInfo(
        yield* sql`
          insert into
            test (name)
          values
            ('world')
        `.raw.pipe(sql.withTransaction)
      );
      expect(second.changes).toBe(1);
      expect(second.lastInsertRowid).toBe(first.lastInsertRowid + 1);
      const rows = yield* sql`
        select
          *
        from
          test
      `;
      expect(rows).toEqual([
        { id: 1, name: 'hello' },
        { id: 2, name: 'world' },
      ]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('returns rows from raw queries', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;
      yield* sql`
        insert into
          test (name)
        values
          ('hello')
      `;

      const rows = yield* sql`
        select
          *
        from
          test
      `.raw;
      expect(rows).toEqual([{ id: 1, name: 'hello' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('returns positional values', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key autoincrement, name text)
      `;
      yield* sql`
        insert into
          test (name)
        values
          ('hello')
      `;
      const rows = yield* sql`
        select
          *
        from
          test
      `.values;
      expect(rows).toEqual([[1, 'hello']]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('rolls back failed transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;
      const error = yield* sql`
        insert into
          test (name)
        values
          ('hello')
      `.pipe(Effect.andThen(Effect.fail('boom')), sql.withTransaction, Effect.flip);
      expect(error).toBe('boom');
      const rows = yield* sql`
        select
          *
        from
          test
      `;
      expect(rows).toEqual([]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('nested transactions use savepoints', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            insert into
              test (name)
            values
              ('kept')
          `;
          const error = yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`
                  insert into
                    test (name)
                  values
                    ('discarded')
                `;
                return yield* Effect.fail('boom');
              })
            )
            .pipe(Effect.flip);
          expect(error).toBe('boom');
        })
      );
      const rows = yield* sql`
        select
          *
        from
          test
      `;
      expect(rows).toEqual([{ id: 1, name: 'kept' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect(
    'times out queued statements without waiting for the transaction to release its connection',
    () =>
      Effect.gen(function* () {
        const dir = yield* makeTempDir;
        const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
        yield* sql`
          create table test (name text)
        `;
        const entered = yield* Deferred.make<true>();
        const release = yield* Deferred.make<true>();
        const transaction = yield* sql
          .withTransaction(
            Deferred.succeed(entered, true).pipe(Effect.andThen(Deferred.await(release)))
          )
          .pipe(Effect.forkChild);
        yield* Deferred.await(entered);

        const queued = yield* sql`
          insert into
            test (name)
          values
            ('cancelled')
        `.pipe(
          Effect.timeout('1 second'),
          Effect.exit,
          Effect.forkChild({ startImmediately: true })
        );
        yield* Effect.gen(function* () {
          yield* TestClock.adjust('1 second');
          expect(queued.pollUnsafe()).toBeDefined();
          const exit = yield* Fiber.join(queued);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('TimeoutError');
          }
        }).pipe(Effect.ensuring(Deferred.succeed(release, true)));

        yield* Fiber.join(transaction);
        yield* sql`
          insert into
            test (name)
          values
            ('after timeout')
        `;
        expect(
          yield* sql`
            select
              name
            from
              test
          `
        ).toEqual([{ name: 'after timeout' }]);
      }).pipe(Effect.provide(TestLayer))
  );

  it.effect('executes concurrent statements', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key autoincrement, name text)
      `;
      yield* Effect.forEach(
        [1, 2, 3, 4, 5, 6, 7, 8],
        (n) => sql`
          insert into
            test (name)
          values
            (${`row-${n}`})
        `,
        { concurrency: 'unbounded', discard: true }
      );
      const rows = yield* sql`
        select
          *
        from
          test
        order by
          name
      `;
      expect(rows.map((row) => row['name'])).toEqual([
        'row-1',
        'row-2',
        'row-3',
        'row-4',
        'row-5',
        'row-6',
        'row-7',
        'row-8',
      ]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('serializes concurrent statements inside a transaction', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;

      yield* sql.withTransaction(
        Effect.forEach(
          [1, 2, 3, 4, 5, 6, 7, 8],
          (n) => sql`
            insert into
              test (id, name)
            values
              (
                ${n},
                ${`row-${n}`}
              )
          `,
          { concurrency: 'unbounded', discard: true }
        )
      );

      const rows = yield* sql`
        select
          *
        from
          test
        order by
          id
      `;
      expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, name: `row-${id}` })));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('preserves result modes for concurrent statements inside a transaction', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key)
      `;
      yield* sql`
        insert into
          test (id)
        values
          (1),
          (2)
      `;

      yield* sql.withTransaction(
        Effect.gen(function* () {
          const query = sql`
            select
              id
            from
              test
            order by
              id
          `;
          const [objects, values] = yield* Effect.all([query, query.values], {
            concurrency: 'unbounded',
          });

          expect(objects).toEqual([{ id: 1 }, { id: 2 }]);
          expect(values).toEqual([[1], [2]]);
        })
      );
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies unique violations with the constraint name', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text unique not null)
      `;
      yield* sql`
        insert into
          test (name)
        values
          ('a')
      `;
      const error = yield* Effect.flip(sql`
        insert into
          test (name)
        values
          ('a')
      `);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('UniqueViolation');
      if (error.reason._tag !== 'UniqueViolation') {
        return;
      }
      expect(error.reason.constraint).toBe('test.name');
      expect(error.reason.isRetryable).toBe(false);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies constraint violations', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text not null)
      `;
      const error = yield* Effect.flip(sql`
        insert into
          test (id, name)
        values
          (1, null)
      `);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('ConstraintError');
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies syntax errors', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      // oxlint-disable-next-line sql/format -- malformed intentionally to exercise syntax errors
      const error = yield* Effect.flip(sql`SELEC 1`);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('SqlSyntaxError');
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('fails a contended transaction with a typed retryable error', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const client = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      const contender = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* contender`
        pragma busy_timeout = 1
      `;

      const exit = yield* client.withTransaction(
        Effect.exit(contender.withTransaction(Effect.void))
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) {
        return;
      }
      // `BEGIN IMMEDIATE` cannot take the write lock, so it fails before a
      // transaction exists. The failure has to stay a typed, retryable
      // `SqlError` instead of being replaced by a rollback defect.
      expect(
        Cause.hasDies(exit.cause),
        `expected a typed failure but the cause contains a defect:\n${Cause.pretty(exit.cause)}`
      ).toBe(false);
      const errorOption = Cause.findErrorOption(exit.cause);
      expect(Option.isSome(errorOption)).toBe(true);
      const error = Option.getOrThrow(errorOption);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('LockTimeoutError');
      if (error.reason._tag !== 'LockTimeoutError') {
        return;
      }
      expect(error.reason.isRetryable).toBe(true);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('uses a 5 second busy timeout by default', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      expect(
        yield* sql`
          pragma busy_timeout
        `
      ).toEqual([{ busy_timeout: 5000 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('defaults to WAL journal mode', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      expect(
        yield* sql`
          pragma journal_mode
        `
      ).toEqual([{ journal_mode: 'wal' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('layer provides the concrete and generic client services', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      yield* Effect.gen(function* () {
        const concrete = yield* TursoSyncClient;
        const generic = yield* SqlClient.SqlClient;
        expect(concrete).toBe(generic);
        yield* concrete`
          create table test (id integer primary key)
        `;
        yield* concrete`
          insert into
            test (id)
          values
            (1)
        `;
        expect(
          yield* generic`
          select
            *
          from
            test
        `
        ).toEqual([{ id: 1 }]);
      }).pipe(Effect.provide(TursoSyncClient.layer({ path: `${dir}/local.db` })));
    }).pipe(Effect.provide(BunFileSystem.layer))
  );
});
