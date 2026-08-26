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
  Stream,
} from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError } from 'effect/unstable/sql';

import { TursoClient, TursoConfigError } from '#src/index.ts';

const isRunInfo = (value: unknown): value is { changes: number; lastInsertRowid: number } =>
  typeof value === 'object' && value !== null && 'changes' in value && 'lastInsertRowid' in value;

const expectRunInfo = (value: unknown) => {
  if (!isRunInfo(value)) {
    throw new Error('expected run info { changes, lastInsertRowid }');
  }
  return value;
};

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

const makeTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped();
});

describe('TursoClient', () => {
  it.effect('uses one connection for in-memory databases by default', () =>
    Effect.gen(function* () {
      const sql = yield* TursoClient.make({ filename: ':memory:' });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`;
      yield* sql`INSERT INTO test (id) VALUES (1)`;
      expect(yield* sql`SELECT * FROM test`).toEqual([{ id: 1 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('rejects multiple connections for in-memory databases', () =>
    Effect.gen(function* () {
      const errors = yield* Effect.all([
        Effect.flip(TursoClient.make({ filename: ':memory:', minConnections: 2 })),
        Effect.flip(TursoClient.make({ filename: ':memory:', maxConnections: 2 })),
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
      const created = yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      expect(created).toEqual([]);
      const inserted = yield* sql`INSERT INTO test (name) VALUES ('hello')`;
      expect(inserted).toEqual([]);
      const selected = yield* sql`SELECT * FROM test`;
      expect(selected).toEqual([{ id: 1, name: 'hello' }]);
      const values = yield* sql`SELECT * FROM test`.valuesUnprepared;
      expect(values).toEqual([[1, 'hello']]);
      const insertedInTxn = yield* sql`INSERT INTO test (name) VALUES ('world')`.pipe(
        sql.withTransaction
      );
      expect(insertedInTxn).toEqual([]);
      const allRows = yield* sql`SELECT * FROM test`;
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
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
      const first = expectRunInfo(yield* sql`INSERT INTO test (name) VALUES ('hello')`.raw);
      expect(first.changes).toBe(1);
      const second = expectRunInfo(
        yield* sql`INSERT INTO test (name) VALUES ('world')`.raw.pipe(sql.withTransaction)
      );
      expect(second.changes).toBe(1);
      expect(second.lastInsertRowid).toBe(first.lastInsertRowid + 1);
      const rows = yield* sql`SELECT * FROM test`;
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
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      yield* sql`INSERT INTO test (name) VALUES ('hello')`;

      const rows = yield* sql`SELECT * FROM test`.raw;
      expect(rows).toEqual([{ id: 1, name: 'hello' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('returns positional values', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
      yield* sql`INSERT INTO test (name) VALUES ('hello')`;
      const rows = yield* sql`SELECT * FROM test`.values;
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
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, row_name TEXT)`;
      yield* sql`INSERT INTO test (id, row_name) VALUES (1, 'first'), (2, 'second')`;

      const rows =
        yield* sql`SELECT id, row_name FROM test WHERE id > ${0} ORDER BY id`.stream.pipe(
          Stream.runCollect
        );
      expect(rows).toEqual([
        { id: 1, rowName: 'first' },
        { id: 2, rowName: 'second' },
      ]);

      const first = yield* sql`SELECT id, row_name FROM test ORDER BY id`.stream.pipe(
        Stream.take(1),
        Stream.runCollect
      );
      expect(first).toEqual([{ id: 1, rowName: 'first' }]);
      expect(yield* sql`SELECT count(*) AS count FROM test`).toEqual([{ count: 2 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('commits transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      yield* sql.withTransaction(sql`INSERT INTO test (name) VALUES ('hello')`);
      const rows = yield* sql`SELECT * FROM test`;
      expect(rows).toEqual([{ id: 1, name: 'hello' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('rolls back failed transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      yield* sql`INSERT INTO test (name) VALUES ('hello')`.pipe(
        Effect.andThen(Effect.fail('boom')),
        sql.withTransaction,
        Effect.ignore
      );
      const rows = yield* sql`SELECT * FROM test`;
      expect(rows).toEqual([]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('nested transactions use savepoints', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO test (name) VALUES ('kept')`;
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`INSERT INTO test (name) VALUES ('discarded')`;
                return yield* Effect.fail('boom');
              })
            )
            .pipe(Effect.ignore);
        })
      );
      const rows = yield* sql`SELECT * FROM test`;
      expect(rows).toEqual([{ id: 1, name: 'kept' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('executes concurrent statements', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
      yield* Effect.forEach(
        [1, 2, 3, 4, 5, 6, 7, 8],
        (n) => sql`INSERT INTO test (name) VALUES (${`row-${n}`})`,
        { concurrency: 'unbounded', discard: true }
      );
      const rows = yield* sql`SELECT * FROM test ORDER BY id`;
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
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;

      yield* sql.withTransaction(
        Effect.forEach(
          [1, 2, 3, 4, 5, 6, 7, 8],
          (n) => sql`INSERT INTO test (id, name) VALUES (${n}, ${`row-${n}`})`,
          { concurrency: 'unbounded', discard: true }
        )
      );

      const rows = yield* sql`SELECT * FROM test ORDER BY id`;
      expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, name: `row-${id}` })));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('preserves result modes for concurrent statements inside a transaction', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`;
      yield* sql`INSERT INTO test (id) VALUES (1), (2)`;

      yield* sql.withTransaction(
        Effect.gen(function* () {
          const query = sql`SELECT id FROM test ORDER BY id`;
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
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`;

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
        yield* sql`SELECT count(*) AS count FROM test`.pipe(Effect.timeout(Duration.seconds(1)))
      ).toEqual([{ count: 0 }]);

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
      yield* sql`CREATE TABLE test (first_name TEXT)`;
      yield* sql`INSERT INTO test (first_name) VALUES ('John')`;
      const rows = yield* sql`SELECT ${sql('first_name')} FROM test`;
      expect(rows).toEqual([{ firstName: 'John' }]);

      const withoutTransforms = sql.withoutTransforms();
      const rawRows = yield* withoutTransforms`SELECT ${withoutTransforms('first_name')} FROM test`;
      expect(rawRows).toEqual([{ first_name: 'John' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies unique violations with the constraint name', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)`;
      yield* sql`INSERT INTO test (name) VALUES ('a')`;
      const error = yield* Effect.flip(sql`INSERT INTO test (name) VALUES ('a')`);
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
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`;
      const error = yield* Effect.flip(sql`INSERT INTO test (id, name) VALUES (1, NULL)`);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('ConstraintError');
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies syntax errors', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
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
      yield* contender`PRAGMA busy_timeout = 1`;

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
      expect(yield* sql`PRAGMA busy_timeout`).toEqual([{ busy_timeout: 5000 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('defaults to WAL journal mode', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      expect(yield* sql`PRAGMA journal_mode`).toEqual([{ journal_mode: 'wal' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('supports safe integers', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`;
      yield* sql`INSERT INTO test (id) VALUES (${9_007_199_254_740_993n})`;

      const normal = yield* Effect.provideService(
        sql`SELECT id FROM test`,
        SqlClient.SafeIntegers,
        false
      );
      expect(normal).toEqual([{ id: 9_007_199_254_740_992 }]);

      const safe = yield* Effect.provideService(
        sql`SELECT id FROM test`,
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
          yield* writable`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
          yield* writable`INSERT INTO test (name) VALUES ('hello')`;
        })
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          const readonlyClient = yield* TursoClient.make({ filename, readonly: true });
          expect(yield* readonlyClient`SELECT * FROM test`).toEqual([{ id: 1, name: 'hello' }]);
          expect(yield* readonlyClient.withTransaction(readonlyClient`SELECT * FROM test`)).toEqual(
            [{ id: 1, name: 'hello' }]
          );
          const error = yield* Effect.flip(readonlyClient`INSERT INTO test (name) VALUES ('nope')`);
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
        yield* generic`CREATE TABLE test (id INTEGER PRIMARY KEY)`;
        expect(yield* generic`SELECT * FROM test`).toEqual([]);
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
