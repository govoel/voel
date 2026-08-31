/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Stream } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError } from 'effect/unstable/sql';

import { TursoClient as SourceTursoClient } from '@repo/effect-turso';

import { TursoSyncClient, TursoSyncError } from '#src/index.ts';
import type { DatabaseOpts } from '#src/index.ts';

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

const makeTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped();
});

const makeSyncFetch = (
  source: SourceTursoClient['Service'],
  onRequest?: (request: Request) => void
): NonNullable<DatabaseOpts['fetch']> =>
  Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      onRequest?.(request);

      const response = await Effect.runPromise(
        source.handleSyncRequest({
          method: request.method,
          path: new URL(request.url).pathname,
          body: new Uint8Array(await request.arrayBuffer()),
        })
      );

      return new Response(response.status === 204 ? null : response.body, {
        status: response.status,
        headers: { 'content-type': response.contentType },
      });
    },
    { preconnect: fetch.preconnect }
  );

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

  it.effect('bootstraps and pulls changes through the Turso Sync protocol', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const source = yield* SourceTursoClient.make({
        disableWalAutoActions: true,
        filename: `${dir}/source.db`,
      });
      yield* source`
        create table synced (id integer primary key, value text not null)
      `;
      yield* source`
        insert into
          synced (id, value)
        values
          (1, 'bootstrapped')
      `;

      const authorizationHeaders: Array<string | null> = [];
      const replica = yield* TursoSyncClient.make({
        path: `${dir}/replica.db`,
        url: 'http://sync.test',
        authToken: async () => 'test-token',
        longPollTimeoutMs: 10,
        fetch: makeSyncFetch(source, (request) => {
          authorizationHeaders.push(request.headers.get('authorization'));
        }),
      });

      expect(
        yield* replica`
          select
            *
          from
            synced
        `
      ).toEqual([{ id: 1, value: 'bootstrapped' }]);

      yield* source`
        insert into
          synced (id, value)
        values
          (2, 'pulled')
      `;
      expect(yield* replica.pull).toBe(true);
      expect(
        yield* replica`
          select
            *
          from
            synced
          order by
            id
        `
      ).toEqual([
        { id: 1, value: 'bootstrapped' },
        { id: 2, value: 'pulled' },
      ]);
      expect(yield* replica.pull).toBe(false);
      expect(authorizationHeaders.length).toBeGreaterThan(0);
      expect(authorizationHeaders.every((header) => header === 'Bearer test-token')).toBe(true);
    }).pipe(Effect.provide(TestLayer))
  );

  it.effect('reports pull failures separately from SQL failures', () =>
    Effect.gen(function* () {
      const dir = yield* makeTempDir;
      const source = yield* SourceTursoClient.make({
        disableWalAutoActions: true,
        filename: `${dir}/source.db`,
      });
      yield* source`
        create table synced (id integer primary key)
      `;

      let rejectRequests = false;
      const syncFetch = makeSyncFetch(source);
      const rejectingFetch: NonNullable<DatabaseOpts['fetch']> = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) =>
          rejectRequests ? new Response('Unauthorized', { status: 401 }) : syncFetch(input, init),
        { preconnect: fetch.preconnect }
      );
      const replica = yield* TursoSyncClient.make({
        path: `${dir}/replica.db`,
        url: 'http://sync.test',
        longPollTimeoutMs: 10,
        fetch: rejectingFetch,
      });

      rejectRequests = true;
      const error = yield* Effect.flip(replica.pull);
      expect(error).toBeInstanceOf(TursoSyncError);
      expect(error.operation).toBe('pull');
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
