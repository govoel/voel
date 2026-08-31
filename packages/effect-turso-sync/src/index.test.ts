/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Stream } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError } from 'effect/unstable/sql';

import { TursoSyncClient } from '#src/index.ts';

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

const makeTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped();
});

describe('TursoSyncClient', () => {
  it.effect('executes queries, result modes, streams, and transactions', () =>
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
          update test
          set
            name = 'updated'
          where
            id = 1
        `.raw
      ).toMatchObject({ changes: 1 });

      const streamed = yield* sql`
          select
            *
          from
            test
          order by
            id
        `.stream.pipe(Stream.runCollect);
      expect(streamed).toEqual([
        { id: 1, name: 'updated' },
        { id: 2, name: 'second' },
      ]);

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
