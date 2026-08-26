/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, FileSystem, Layer, Option } from 'effect';
import * as Reactivity from 'effect/unstable/reactivity/Reactivity';
import { SafeIntegers, SqlClient } from 'effect/unstable/sql/SqlClient';
import { isSqlError } from 'effect/unstable/sql/SqlError';

import { TursoClient } from '#src/index.ts';

const isRunInfo = (value: unknown): value is { changes: number; lastInsertRowid: number } =>
  typeof value === 'object' && value !== null && 'changes' in value && 'lastInsertRowid' in value;

const expectRunInfo = (value: unknown): { changes: number; lastInsertRowid: number } => {
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
  it.effect('should work', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      const created = yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      assert.deepStrictEqual(created, []);
      const inserted = yield* sql`INSERT INTO test (name) VALUES ('hello')`;
      assert.deepStrictEqual(inserted, []);
      const selected = yield* sql`SELECT * FROM test`;
      assert.deepStrictEqual(selected, [{ id: 1, name: 'hello' }]);
      const values = yield* sql`SELECT * FROM test`.valuesUnprepared;
      assert.deepStrictEqual(values, [[1, 'hello']]);
      const insertedInTxn = yield* sql`INSERT INTO test (name) VALUES ('world')`.pipe(
        sql.withTransaction
      );
      assert.deepStrictEqual(insertedInTxn, []);
      const allRows = yield* sql`SELECT * FROM test`;
      assert.deepStrictEqual(allRows, [
        { id: 1, name: 'hello' },
        { id: 2, name: 'world' },
      ]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('should work with raw', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
      const first = expectRunInfo(yield* sql`INSERT INTO test (name) VALUES ('hello')`.raw);
      assert.strictEqual(first.changes, 1);
      const second = expectRunInfo(
        yield* sql`INSERT INTO test (name) VALUES ('world')`.raw.pipe(sql.withTransaction)
      );
      assert.strictEqual(second.changes, 1);
      assert.strictEqual(second.lastInsertRowid, first.lastInsertRowid + 1);
      const rows = yield* sql`SELECT * FROM test`;
      assert.deepStrictEqual(rows, [
        { id: 1, name: 'hello' },
        { id: 2, name: 'world' },
      ]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('should work with values', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
      yield* sql`INSERT INTO test (name) VALUES ('hello')`;
      const rows = yield* sql`SELECT * FROM test`.values;
      assert.deepStrictEqual(rows, [[1, 'hello']]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('withTransaction', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`;
      yield* sql.withTransaction(sql`INSERT INTO test (name) VALUES ('hello')`);
      const rows = yield* sql`SELECT * FROM test`;
      assert.deepStrictEqual(rows, [{ id: 1, name: 'hello' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('withTransaction rollback', () =>
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
      assert.deepStrictEqual(rows, []);
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
      assert.deepStrictEqual(rows, [{ id: 1, name: 'kept' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('concurrent statements all execute', () =>
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
      assert.deepStrictEqual(
        rows.map((row) => row['name']),
        ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6', 'row-7', 'row-8']
      );
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('should use transforms', () =>
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
      assert.deepStrictEqual(rows, [{ firstName: 'John' }]);

      const withoutTransforms = sql.withoutTransforms();
      const rawRows = yield* withoutTransforms`SELECT ${withoutTransforms('first_name')} FROM test`;
      assert.deepStrictEqual(rawRows, [{ first_name: 'John' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies unique violations with the constraint name', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)`;
      yield* sql`INSERT INTO test (name) VALUES ('a')`;
      const error = yield* Effect.flip(sql`INSERT INTO test (name) VALUES ('a')`);
      assert.isTrue(isSqlError(error));
      assert.strictEqual(error.reason._tag, 'UniqueViolation');
      if (error.reason._tag !== 'UniqueViolation') {
        return;
      }
      assert.strictEqual(error.reason.constraint, 'test.name');
      assert.isFalse(error.reason.isRetryable);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies constraint violations', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`;
      const error = yield* Effect.flip(sql`INSERT INTO test (id, name) VALUES (1, NULL)`);
      assert.isTrue(isSqlError(error));
      assert.strictEqual(error.reason._tag, 'ConstraintError');
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies syntax errors', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      const error = yield* Effect.flip(sql`SELEC 1`);
      assert.isTrue(isSqlError(error));
      assert.strictEqual(error.reason._tag, 'SqlSyntaxError');
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

      assert.isTrue(Exit.isFailure(exit));
      if (!Exit.isFailure(exit)) {
        return;
      }
      // `BEGIN IMMEDIATE` cannot take the write lock, so it fails before a
      // transaction exists. The failure has to stay a typed, retryable
      // `SqlError` instead of being replaced by a rollback defect.
      assert.isFalse(
        Cause.hasDies(exit.cause),
        `expected a typed failure but the cause contains a defect:
${Cause.pretty(exit.cause)}`
      );
      const errorOption = Cause.findErrorOption(exit.cause);
      assert.isTrue(Option.isSome(errorOption));
      const error = Option.getOrThrow(errorOption);
      assert.isTrue(isSqlError(error));
      assert.strictEqual(error.reason._tag, 'LockTimeoutError');
      if (error.reason._tag !== 'LockTimeoutError') {
        return;
      }
      assert.isTrue(error.reason.isRetryable);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('uses a 5 second busy timeout by default', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      assert.deepStrictEqual(yield* sql`PRAGMA busy_timeout`, [{ busy_timeout: 5000 }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('defaults to WAL journal mode', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      assert.deepStrictEqual(yield* sql`PRAGMA journal_mode`, [{ journal_mode: 'wal' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('supports safe integers', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoClient.make({ filename: `${dir}/test.db` });
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`;
      yield* sql`INSERT INTO test (id) VALUES (${9_007_199_254_740_993n})`;

      const normal = yield* Effect.provideService(sql`SELECT id FROM test`, SafeIntegers, false);
      assert.deepStrictEqual(normal, [{ id: 9_007_199_254_740_992 }]);

      const safe = yield* Effect.provideService(sql`SELECT id FROM test`, SafeIntegers, true);
      assert.deepStrictEqual(safe, [{ id: 9_007_199_254_740_993n }]);
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
          assert.deepStrictEqual(yield* readonlyClient`SELECT * FROM test`, [
            { id: 1, name: 'hello' },
          ]);
          const error = yield* Effect.flip(readonlyClient`INSERT INTO test (name) VALUES ('nope')`);
          assert.isTrue(isSqlError(error));
        })
      );
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('layer provides the concrete and generic client services', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      yield* Effect.gen(function* () {
        const concrete = yield* TursoClient;
        assert.strictEqual(concrete.config.spanAttributes?.['db.example'], 'voel');
        const generic = yield* SqlClient;
        yield* generic`CREATE TABLE test (id INTEGER PRIMARY KEY)`;
        assert.deepStrictEqual(yield* generic`SELECT * FROM test`, []);
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
