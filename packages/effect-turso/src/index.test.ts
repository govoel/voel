/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Schema,
  Stream,
} from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError } from 'effect/unstable/sql';

import { TursoClient, TursoConfigError } from '#src/index.ts';

const decodeRunInfo = Schema.decodeUnknownSync(
  Schema.Struct({ changes: Schema.Int, lastInsertRowid: Schema.Int })
);

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

const makeTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped();
});

const makeSyncRequest = (path: string, init: RequestInit) =>
  HttpServerRequest.fromWeb(new Request(`http://localhost${path}`, init));

describe('TursoClient', () => {
  it.effect('uses one connection for in-memory databases by default', () =>
    Effect.gen(function* () {
      const sql = yield* TursoClient.make({ filename: ':memory:' });
      yield* sql`
        create table test (id integer primary key)
      `;
      yield* sql`
        insert into
          test (id)
        values
          (1)
      `;
      expect(
        yield* sql`
          select
            *
          from
            test
        `
      ).toEqual([{ id: 1 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('rejects multiple connections for in-memory databases', () =>
    Effect.gen(function* () {
      const errors = yield* Effect.all([
        Effect.flip(TursoClient.make<never>({ filename: ':memory:', minConnections: 2 })),
        Effect.flip(TursoClient.make<never>({ filename: ':memory:', maxConnections: 2 })),
      ]);

      for (const error of errors) {
        expect(error).toBeInstanceOf(TursoConfigError);
      }
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('executes queries and transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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

  it.effect('streams query results', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({
        filename: `${dir}/test.db`,
        transformResultNames: (name) => (name === 'row_name' ? 'rowName' : name),
      });
      yield* sql`
        create table test (id integer primary key, row_name text)
      `;
      yield* sql`
        insert into
          test (id, row_name)
        values
          (1, 'first'),
          (2, 'second')
      `;

      const rows = yield* sql`
          select
            id,
            row_name
          from
            test
          where
            id > ${0}
          order by
            id
        `.stream.pipe(Stream.runCollect);
      expect(rows).toEqual([
        { id: 1, rowName: 'first' },
        { id: 2, rowName: 'second' },
      ]);

      const first = yield* sql`
        select
          id,
          row_name
        from
          test
        order by
          id
      `.stream.pipe(Stream.take(1), Stream.runCollect);
      expect(first).toEqual([{ id: 1, rowName: 'first' }]);
      expect(
        yield* sql`
          select
            count(*) as count
          from
            test
        `
      ).toEqual([{ count: 2 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('commits transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;
      yield* sql.withTransaction(sql`
        insert into
          test (name)
        values
          ('hello')
      `);
      const rows = yield* sql`
        select
          *
        from
          test
      `;
      expect(rows).toEqual([{ id: 1, name: 'hello' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('rolls back failed transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;
      yield* sql`
        insert into
          test (name)
        values
          ('hello')
      `.pipe(Effect.andThen(Effect.fail('boom')), sql.withTransaction, Effect.ignore);
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
          yield* sql
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
            .pipe(Effect.ignore);
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

  it.effect('executes concurrent statements', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
          id
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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

  it.effect('uses another pooled connection while a transaction reserves one', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({
        filename: `${dir}/test.db`,
        minConnections: 1,
        maxConnections: 2,
      });
      yield* sql`
        create table test (id integer primary key)
      `;

      const transactionStarted = yield* Deferred.make<boolean>();
      const releaseTransaction = yield* Deferred.make<boolean>();
      const transaction = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* Deferred.succeed(transactionStarted, true);
            yield* Deferred.await(releaseTransaction);
          })
        )
        .pipe(Effect.forkChild);

      yield* Deferred.await(transactionStarted);
      expect(
        yield* sql`
          select
            count(*) as count
          from
            test
        `.pipe(Effect.timeout(Duration.seconds(1)))
      ).toEqual([{ count: 0 }]);

      yield* Deferred.succeed(releaseTransaction, true);
      yield* Fiber.join(transaction);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('runs onConnect for every pooled connection', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      let connections = 0;
      const sql = yield* TursoClient.make({
        filename: `${dir}/test.db`,
        minConnections: 1,
        maxConnections: 2,
        onConnect: ({ exec }) =>
          Effect.gen(function* () {
            connections += 1;
            yield* exec('PRAGMA foreign_keys = ON');
          }),
      });

      const transactionStarted = yield* Deferred.make<boolean>();
      const releaseTransaction = yield* Deferred.make<boolean>();
      const transaction = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* Deferred.succeed(transactionStarted, true);
            yield* Deferred.await(releaseTransaction);
          })
        )
        .pipe(Effect.forkChild);

      yield* Deferred.await(transactionStarted);
      expect(
        yield* sql`
          pragma foreign_keys
        `
      ).toEqual([{ foreign_keys: 1 }]);
      expect(connections).toBe(2);

      yield* Deferred.succeed(releaseTransaction, true);
      yield* Fiber.join(transaction);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('applies query and result name transforms', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({
        filename: `${dir}/test.db`,
        transformQueryNames: (name) => (name === 'firstName' ? 'first_name' : name),
        transformResultNames: (name) => (name === 'first_name' ? 'firstName' : name),
      });
      yield* sql`
        create table test (first_name text)
      `;
      yield* sql`
        insert into
          test (first_name)
        values
          ('John')
      `;
      const rows = yield* sql`
        select
          ${sql('first_name')}
        from
          test
      `;
      expect(rows).toEqual([{ firstName: 'John' }]);

      const withoutTransforms = sql.withoutTransforms();
      const rawRows = yield* withoutTransforms`
        select
          ${withoutTransforms('first_name')}
        from
          test
      `;
      expect(rawRows).toEqual([{ first_name: 'John' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies unique violations with the constraint name', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      // oxlint-disable-next-line sql/format -- malformed intentionally to exercise syntax errors
      const error = yield* Effect.flip(sql`SELEC 1`);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('SqlSyntaxError');
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('fails a contended transaction with a typed retryable error', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const client = yield* TursoClient.make({ filename: `${dir}/test.db` });
      const contender = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      expect(
        yield* sql`
          pragma journal_mode
        `
      ).toEqual([{ journal_mode: 'wal' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('handles Turso Sync protocol requests through the Effect client', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({
        disableWalAutoActions: true,
        filename: `${dir}/test.db`,
      });
      yield* sql`
        create table synced (value text not null)
      `;

      const options = yield* sql.syncHandler(
        makeSyncRequest('/pull-updates', { method: 'OPTIONS' })
      );
      expect(options).toMatchObject({ status: 204, body: { _tag: 'Empty' } });
      expect(options.headers['content-type']).toBe('text/plain');

      const missing = yield* sql.syncHandler(makeSyncRequest('/missing', { method: 'POST' }));
      expect(missing).toMatchObject({ status: 404, body: { _tag: 'Stream' } });
      expect(missing.headers['content-type']).toBe('text/plain');
      expect(yield* Effect.promise(async () => HttpServerResponse.toWeb(missing).text())).toBe(
        'Not Found'
      );

      const pipeline = yield* sql.syncHandler(
        makeSyncRequest('/v2/pipeline', {
          method: 'POST',
          body: `{"requests":[{"type":"execute","stmt":{"sql":"INSERT INTO synced VALUES ('yes')"}}]}`,
        })
      );
      expect(pipeline.status).toBe(200);
      expect(
        yield* sql`
          select
            value
          from
            synced
        `
      ).toEqual([{ value: 'yes' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('requires automatic WAL actions to be disabled for sync requests', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      const error = yield* Effect.flip(
        sql.syncHandler(makeSyncRequest('/pull-updates', { method: 'OPTIONS' }))
      );

      expect(error).toBeInstanceOf(TursoConfigError);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('supports safe integers', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`
        create table test (id integer primary key)
      `;
      yield* sql`
        insert into
          test (id)
        values
          (${9_007_199_254_740_993n})
      `;

      const normal = yield* Effect.provideService(
        sql`
          select
            id
          from
            test
        `,
        SqlClient.SafeIntegers,
        false
      );
      expect(normal).toEqual([{ id: 9_007_199_254_740_992 }]);

      const safe = yield* Effect.provideService(
        sql`
          select
            id
          from
            test
        `,
        SqlClient.SafeIntegers,
        true
      );
      expect(safe).toEqual([{ id: 9_007_199_254_740_993n }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('supports readonly clients', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const filename = `${dir}/test.db`;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const writable = yield* TursoClient.make({ filename });
          yield* writable`
            create table test (id integer primary key, name text)
          `;
          yield* writable`
            insert into
              test (name)
            values
              ('hello')
          `;
        })
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          const readonlyClient = yield* TursoClient.make({ filename, readonly: true });
          expect(
            yield* readonlyClient`
            select
              *
            from
              test
          `
          ).toEqual([{ id: 1, name: 'hello' }]);
          expect(
            yield* readonlyClient.withTransaction(readonlyClient`
            select
              *
            from
              test
          `)
          ).toEqual([{ id: 1, name: 'hello' }]);
          const error = yield* Effect.flip(readonlyClient`
            insert into
              test (name)
            values
              ('nope')
          `);
          expect(SqlError.isSqlError(error)).toBe(true);
        })
      );
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('layer provides the concrete and generic client services', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      yield* Effect.gen(function* () {
        const concrete = yield* TursoClient;
        expect(concrete.config.spanAttributes?.['db.example']).toBe('voel');
        const generic = yield* SqlClient.SqlClient;
        yield* generic`
          create table test (id integer primary key)
        `;
        expect(
          yield* generic`
          select
            *
          from
            test
        `
        ).toEqual([]);
      }).pipe(
        Effect.provide(
          TursoClient.layer({
            filename: `${dir}/test.db`,
            spanAttributes: { 'db.example': 'voel' },
          })
        )
      );
    }).pipe(Effect.provide(BunFileSystem.layer))
  );
});
