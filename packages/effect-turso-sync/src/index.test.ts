/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { StatementPromise } from '@tursodatabase/database-common';
import { connect } from '@tursodatabase/sync';
import { Effect, FileSystem, Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError } from 'effect/unstable/sql';

import { TursoSyncClient } from '#src/index.ts';

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

const makeTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped();
});

describe('TursoSyncClient', () => {
  it.effect('uses database-common promise statements', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const db = yield* Effect.acquireRelease(
        Effect.promise(async () => connect({ path: `${dir}/local.db` })),
        (database) => Effect.promise(async () => database.close())
      );
      const statement: unknown = yield* Effect.promise(async (): Promise<unknown> => {
        const prepared: unknown = await db.prepare('select 1 as value');
        return prepared;
      });

      expect(statement).toBeInstanceOf(StatementPromise);
      if (!(statement instanceof StatementPromise)) {
        return;
      }
      expect(statement.columns()).toEqual([
        {
          column: null,
          database: null,
          name: 'value',
          table: null,
          type: null,
        },
      ]);
      const objectRows = yield* Effect.promise(async (): Promise<unknown> => {
        const rows: unknown = await statement.all();
        return rows;
      });
      expect(objectRows).toEqual([{ value: 1 }]);
      statement.raw(true);
      const valueRows = yield* Effect.promise(async (): Promise<unknown> => {
        const rows: unknown = await statement.all();
        return rows;
      });
      expect(valueRows).toEqual([[1]]);
      statement.close();
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('executes queries, result modes, and transactions', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text unique not null)
      `;
      yield* sql.withTransaction(
        Effect.forEach(
          [
            { id: 1, name: 'first' },
            { id: 2, name: 'second' },
          ],
          ({ id, name }) => sql`
            insert into
              test (id, name)
            values
              (
                ${id},
                ${name}
              )
          `,
          { discard: true }
        )
      );

      expect(
        yield* sql`
          select
            *
          from
            test
          order by
            id
        `
      ).toEqual([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);
      expect(
        yield* sql`
          select
            id,
            name
          from
            test
          order by
            id
        `.values
      ).toEqual([
        [1, 'first'],
        [2, 'second'],
      ]);
      expect(
        yield* sql`
          select
            id,
            name
          from
            test
          order by
            id
        `.valuesUnprepared
      ).toEqual([
        [1, 'first'],
        [2, 'second'],
      ]);
      expect(
        yield* sql`
          select
            *
          from
            test
          order by
            id
        `.raw
      ).toEqual([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);
      expect(
        yield* sql`
          update test
          set
            name = 'updated'
          where
            id = 1
        `.raw
      ).toMatchObject({ changes: 1 });

      yield* sql
        .withTransaction(
          sql`
            insert into
              test (id, name)
            values
              (3, 'rolled back')
          `.pipe(Effect.andThen(Effect.fail('rollback')))
        )
        .pipe(Effect.ignore);
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

  it.effect('uses savepoints for nested transactions', () =>
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
          yield* sql
            .withTransaction(
              sql`
                insert into
                  test (name)
                values
                  ('discarded')
              `.pipe(Effect.andThen(Effect.fail('rollback')))
            )
            .pipe(Effect.ignore);
        })
      );

      expect(
        yield* sql`
          select
            *
          from
            test
        `
      ).toEqual([{ id: 1, name: 'kept' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('serializes concurrent statements and preserves result modes', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (id integer primary key, name text)
      `;
      yield* Effect.forEach(
        [1, 2, 3, 4, 5, 6, 7, 8],
        (id) => sql`
          insert into
            test (id, name)
          values
            (
              ${id},
              ${`row-${id}`}
            )
        `,
        { concurrency: 'unbounded', discard: true }
      );

      const query = sql`
        select
          id,
          name
        from
          test
        order by
          id
      `;
      const [objects, values] = yield* Effect.all([query, query.values], {
        concurrency: 'unbounded',
      });

      expect(objects).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, name: `row-${id}` })));
      expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((id) => [id, `row-${id}`]));
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('runs onConnect and applies configuration and name transforms', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      let connections = 0;
      const sql = yield* TursoSyncClient.make({
        path: `${dir}/local.db`,
        busyTimeout: 37,
        onConnect: ({ exec }) =>
          Effect.gen(function* () {
            connections += 1;
            yield* exec('PRAGMA foreign_keys = ON');
          }),
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

      expect(connections).toBe(1);
      expect(
        yield* sql`
          pragma busy_timeout
        `
      ).toEqual([{ busy_timeout: 37 }]);
      expect(
        yield* sql`
          pragma foreign_keys
        `
      ).toEqual([{ foreign_keys: 1 }]);
      expect(
        yield* sql`
          select
            ${sql('first_name')}
          from
            test
        `
      ).toEqual([{ firstName: 'John' }]);

      const withoutTransforms = sql.withoutTransforms();
      expect(
        yield* withoutTransforms`
          select
            ${withoutTransforms('first_name')}
          from
            test
        `
      ).toEqual([{ first_name: 'John' }]);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('classifies SQL errors', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const sql = yield* TursoSyncClient.make({ path: `${dir}/local.db` });
      yield* sql`
        create table test (name text unique not null)
      `;
      yield* sql`
        insert into
          test (name)
        values
          ('duplicate')
      `;

      const error = yield* Effect.flip(sql`
        insert into
          test (name)
        values
          ('duplicate')
      `);
      expect(SqlError.isSqlError(error)).toBe(true);
      expect(error.reason._tag).toBe('UniqueViolation');
      if (error.reason._tag === 'UniqueViolation') {
        expect(error.reason.constraint).toBe('test.name');
      }

      const constraintError = yield* Effect.flip(sql`
        insert into
          test (name)
        values
          (null)
      `);
      expect(SqlError.isSqlError(constraintError)).toBe(true);
      expect(constraintError.reason._tag).toBe('ConstraintError');

      // oxlint-disable-next-line sql/format -- malformed intentionally to exercise syntax errors
      const syntaxError = yield* Effect.flip(sql`SELEC 1`);
      expect(SqlError.isSqlError(syntaxError)).toBe(true);
      expect(syntaxError.reason._tag).toBe('SqlSyntaxError');
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('layer provides both concrete and generic SQL services', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      yield* Effect.gen(function* () {
        const concrete = yield* TursoSyncClient;
        expect(concrete.config.spanAttributes?.['db.example']).toBe('voel');
        const generic = yield* SqlClient.SqlClient;
        yield* generic`
          create table test (id integer primary key)
        `;
      }).pipe(
        Effect.provide(
          TursoSyncClient.layer({
            path: `${dir}/local.db`,
            spanAttributes: { 'db.example': 'voel' },
          })
        )
      );
    }).pipe(Effect.provide(BunFileSystem.layer))
  );
});
