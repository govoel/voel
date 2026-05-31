import { BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Schema, SchemaGetter, SchemaIssue } from 'effect';
import { RpcMiddleware, RpcTest } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import {
  DatabaseErrorWithNSE,
  DatabaseNoSuchElementError,
  DatabaseSqlError,
} from '@repo/spec-api/database/index.ts';
import { LibraryTable, MediaTypes } from '@repo/spec-api/database/library.ts';
import { AuthMiddleware, Unauthorized } from '@repo/spec-api/middlewares/auth.ts';

import { LibraryHandlers } from '#src/groups/library.ts';
import { makeAuthedClient } from '#src/groups/utils.ts';
import { AdminMiddlewareLive, Auth, AuthMiddlewareLive } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';
import { LibraryRepository } from '#src/services/database/repos/library.ts';

const makeTestLayer = () =>
  LibraryHandlers.pipe(
    Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLive, AdminMiddlewareLive)),
    Layer.provideMerge(Layer.mergeAll(Auth.layer, LibraryRepository.layer)),
    Layer.provideMerge(DatabaseLive),
    Layer.provideMerge(BunPath.layer),
    Layer.provideMerge(ApiConfig.layerTest())
  );

const forceBrandLibraryId = Schema.decodeEffect(
  Schema.Number.pipe(
    Schema.decodeTo(LibraryTable.fields.id, {
      decode: SchemaGetter.transform((i) => i),
      encode: SchemaGetter.transform((i) => i),
    })
  )
);

const formatSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1();

it.layer(
  RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request)).pipe(
    Layer.provideMerge(makeTestLayer())
  )
)('library authorization', (iit) => {
  iit.effect(
    'should reject unauthenticated library mutations',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(Api);

      const upsertResult = yield* client
        .libraryUpsert({
          id: Option.none(),
          type: 'movie',
          name: 'Unauthorized Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      const deleteResult = yield* client
        .libraryDelete({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);

      expect(upsertResult).toBeInstanceOf(Unauthorized);
      expect(deleteResult).toBeInstanceOf(Unauthorized);
    })
  );

  iit.effect.each(['user', 'under18'] as const)(
    'should reject %s library mutations',
    Effect.fnUntraced(function* (role) {
      const client = yield* makeAuthedClient({ username: `library-auth-${role}`, role });

      const upsertResult = yield* client
        .libraryUpsert({
          id: Option.none(),
          type: 'movie',
          name: `${role} Unauthorized Library`,
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      const deleteResult = yield* client
        .libraryDelete({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);

      expect(upsertResult).toBeInstanceOf(Unauthorized);
      expect(deleteResult).toBeInstanceOf(Unauthorized);
    })
  );

  iit.effect(
    'should reject unauthenticated library reads',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(Api);

      const getResult = yield* client
        .libraryGet({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);
      const listResult = yield* client
        .libraryList({ cursor: Option.none(), limit: 1 })
        .pipe(Effect.flip);

      expect(getResult).toBeInstanceOf(Unauthorized);
      expect(listResult).toBeInstanceOf(Unauthorized);
    })
  );

  iit.effect.each(['user', 'under18'] as const)(
    'should allow %s library reads',
    Effect.fnUntraced(function* (role) {
      const adminClient = yield* makeAuthedClient({
        username: `library-read-admin-${role}`,
        role: 'admin',
      });
      const marker = yield* adminClient.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: `${role} Read Marker Library`,
        absolutePaths: [],
      });
      const library = yield* adminClient.libraryUpsert({
        id: Option.none(),
        type: 'show',
        name: `${role} Read Library`,
        absolutePaths: [`/show/${role}-read`],
      });
      const client = yield* makeAuthedClient({ username: `library-read-${role}`, role });

      const getResult = yield* client.libraryGet({ id: library.id });
      const listResult = yield* client.libraryList({ cursor: Option.some(marker.id), limit: 1 });

      expect(getResult).toEqual({
        id: library.id,
        type: 'show',
        name: `${role} Read Library`,
        absolutePaths: [`/show/${role}-read`],
      });
      expect(listResult).toEqual({
        items: [getResult],
        nextCursor: Option.none(),
      });
    })
  );
});

it.layer(makeTestLayer())('library', (iit) => {
  iit.effect(
    'should list active libraries',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'List Movie Library',
        absolutePaths: ['/movie/list-path'],
      });
      const result2 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'show',
        name: 'List Show Library',
        absolutePaths: ['/show/list-path-1', '/show/list-path-2'],
      });
      const result3 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'audiobook',
        name: 'List Audiobook Library',
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result2.id });

      const result = yield* client.libraryList({ cursor: Option.none(), limit: 50 });

      expect(result).toEqual({
        items: [
          {
            id: result1.id,
            type: 'movie',
            name: 'List Movie Library',
            absolutePaths: ['/movie/list-path'],
          },
          {
            id: result3.id,
            type: 'audiobook',
            name: 'List Audiobook Library',
            absolutePaths: [],
          },
        ],
        nextCursor: Option.none(),
      });
    })
  );

  iit.effect(
    'should paginate active libraries by cursor',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const marker = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Page Cursor Marker Library',
        absolutePaths: [],
      });
      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Page Movie Library',
        absolutePaths: ['/movie/page-path'],
      });
      const result2 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'show',
        name: 'Page Show Library',
        absolutePaths: ['/show/page-path'],
      });
      const result3 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'audiobook',
        name: 'Page Audiobook Library',
        absolutePaths: ['/audiobook/page-path'],
      });
      const result4 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Page Extra Movie Library',
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result2.id });

      const page1 = yield* client.libraryList({ cursor: Option.some(marker.id), limit: 2 });

      expect(page1).toEqual({
        items: [
          {
            id: result1.id,
            type: 'movie',
            name: 'Page Movie Library',
            absolutePaths: ['/movie/page-path'],
          },
          {
            id: result3.id,
            type: 'audiobook',
            name: 'Page Audiobook Library',
            absolutePaths: ['/audiobook/page-path'],
          },
        ],
        nextCursor: Option.some(result3.id),
      });

      const page2 = yield* client.libraryList({ cursor: page1.nextCursor, limit: 2 });

      expect(page2).toEqual({
        items: [
          {
            id: result4.id,
            type: 'movie',
            name: 'Page Extra Movie Library',
            absolutePaths: [],
          },
        ],
        nextCursor: Option.none(),
      });

      const pageAfterFirst = yield* client.libraryList({
        cursor: Option.some(result1.id),
        limit: 1,
      });

      expect(pageAfterFirst).toEqual({
        items: [
          {
            id: result3.id,
            type: 'audiobook',
            name: 'Page Audiobook Library',
            absolutePaths: ['/audiobook/page-path'],
          },
        ],
        nextCursor: Option.some(result3.id),
      });
    })
  );

  iit.effect(
    'should return an empty page after the last library',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Empty Page Movie Library',
        absolutePaths: [],
      });

      const result = yield* client.libraryList({ cursor: Option.some(result1.id), limit: 10 });

      expect(result).toEqual({
        items: [],
        nextCursor: Option.none(),
      });
    })
  );

  iit.effect(
    'should list a page larger than the active library count',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const marker = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Large Page Cursor Marker Library',
        absolutePaths: [],
      });
      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Large Page Movie Library',
        absolutePaths: ['/movie/large-page-path'],
      });
      const result2 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'audiobook',
        name: 'Large Page Audiobook Library',
        absolutePaths: [],
      });

      const result = yield* client.libraryList({ cursor: Option.some(marker.id), limit: 100 });

      expect(result).toEqual({
        items: [
          {
            id: result1.id,
            type: 'movie',
            name: 'Large Page Movie Library',
            absolutePaths: ['/movie/large-page-path'],
          },
          {
            id: result2.id,
            type: 'audiobook',
            name: 'Large Page Audiobook Library',
            absolutePaths: [],
          },
        ],
        nextCursor: Option.none(),
      });
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type}`,
          absolutePaths: [`/${type}/path`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type}`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([`/${type}/path`]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library with no paths',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} None`,
          absolutePaths: [],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type} None`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library with multiple paths',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Multi`,
          absolutePaths: [`/${type}/path1`, `/${type}/path2`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type} Multi`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([`/${type}/path1`, `/${type}/path2`]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect(
    'should reject relative library paths',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type: 'movie',
          name: 'Relative Path Library',
          absolutePaths: [
            '/valid/path',
            'relative/path',
            '/another/valid/path',
            'another/relative/path',
          ],
        })
        .pipe(Effect.flip);

      expect(result).toBeInstanceOf(Schema.SchemaError);
      if (!Schema.isSchemaError(result)) {
        throw new Error('Expected SchemaError');
      }

      const { issues } = formatSchemaIssue(result.issue);
      expect(issues).toEqual([
        expect.objectContaining({
          message: 'Expected an absolute path',
          path: [1],
        }),
        expect.objectContaining({
          message: 'Expected an absolute path',
          path: [3],
        }),
      ]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should soft delete a %s library and recreate it',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Delete`,
        absolutePaths: [`/${type}/path-delete`],
      });

      yield* client.libraryDelete({ id: result1.id });

      const result2 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Delete`,
          absolutePaths: [`/${type}/path-delete`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.name).toBe(`My ${type} Delete`);
      expect(result2.type).toBe(type);
      expect(result2.absolutePaths).toEqual([`/${type}/path-delete`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should soft delete a %s library and restore it by id',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Restore By Id`,
        absolutePaths: [`/${type}/path-restore-by-id`],
      });

      yield* client.libraryDelete({ id: result1.id });

      const deletedResult = yield* client.libraryGet({ id: result1.id }).pipe(Effect.flip);
      if (!Schema.is(DatabaseErrorWithNSE)(deletedResult)) {
        throw new Error('Expected a DatabaseError');
      }
      expect(deletedResult.reason).toBeInstanceOf(DatabaseNoSuchElementError);

      const result2 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} Restored By Id`,
          absolutePaths: [`/${type}/path-restore-by-id`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.name).toBe(`My ${type} Restored By Id`);
      expect(result2.type).toBe(type);
      expect(result2.absolutePaths).toEqual([`/${type}/path-restore-by-id`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    '%s library paths should not get deleted on upsert',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Paths`,
          absolutePaths: [`/${type}/path-old`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));
      expect(result1.absolutePaths).toEqual([`/${type}/path-old`]);

      const result2 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Paths`,
          absolutePaths: [`/${type}/path-new`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.absolutePaths).toEqual([`/${type}/path-new`]);

      const result3 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} Path Delete`,
          absolutePaths: [],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result3.id).toBe(result1.id);
      expect(result3.name).toBe(`My ${type} Path Delete`);
      expect(result3.type).toBe(type);
      expect(result3.absolutePaths).toEqual([]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should de-duplicate paths for a %s library',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Duplicate Paths`,
          absolutePaths: [`/${type}/duplicate-path`, `/${type}/duplicate-path`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type} Duplicate Paths`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([`/${type}/duplicate-path`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should restore a removed path for a %s library',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Restore Path`,
        absolutePaths: [`/${type}/restore-path`],
      });

      const result2 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} Restore Path`,
          absolutePaths: [],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.absolutePaths).toEqual([]);

      const result3 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} Restore Path`,
          absolutePaths: [`/${type}/restore-path`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result3.id).toBe(result1.id);
      expect(result3.absolutePaths).toEqual([`/${type}/restore-path`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'name changes for %s library is supported',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Old Name`,
          absolutePaths: [`/${type}/path-name`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result1.name).toBe(`My ${type} Old Name`);

      const result2 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} New Name`,
          absolutePaths: [`/${type}/path-name`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.name).toBe(`My ${type} New Name`);
      expect(result2.type).toBe(type);
      expect(result2.absolutePaths).toEqual([`/${type}/path-name`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    '%s library type should change on upsert, with associated tables cleaned up',
    Effect.fnUntraced(function* (type) {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Type`,
        absolutePaths: [`/${type}/path-type`],
      });

      const differentType = type === 'movie' ? 'show' : 'movie';

      const result2 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type: differentType,
          name: `My ${type} Type`,
          absolutePaths: [`/${type}/path-type`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.type).toBe(differentType);

      // TODO: Verify associated tables are cleaned up based on the library type
    })
  );

  iit.effect(
    'should fail to get a non-existent library',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryGet({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);

      if (!Schema.is(DatabaseErrorWithNSE)(result)) {
        throw new Error('Expected a DatabaseError');
      }
      expect(result.reason).toBeInstanceOf(DatabaseNoSuchElementError);
    })
  );

  iit.effect(
    'should fail to get a deleted library',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: `Deleted Library`,
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result1.id });

      const result2 = yield* client.libraryGet({ id: result1.id }).pipe(Effect.flip);

      if (!Schema.is(DatabaseErrorWithNSE)(result2)) {
        throw new Error('Expected a DatabaseError');
      }
      expect(result2.reason).toBeInstanceOf(DatabaseNoSuchElementError);
    })
  );

  iit.effect(
    'should succeed in deleting a non-existent library',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      yield* client.libraryDelete({ id: yield* forceBrandLibraryId(999_999) });
    })
  );

  iit.effect(
    'should fail to upsert with a non-existent id',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      const result = yield* client
        .libraryUpsert({
          id: Option.some(yield* forceBrandLibraryId(999_999)),
          type: 'movie',
          name: 'Ghost Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      if (!Schema.is(DatabaseErrorWithNSE)(result)) {
        throw new Error('Expected a DatabaseError');
      }
      expect(result.reason).toBeInstanceOf(DatabaseNoSuchElementError);
      if (!Schema.is(DatabaseNoSuchElementError)(result.reason)) {
        throw new Error('Expected a DatabaseNoSuchElementError');
      }
      expect(result.reason.operation).toBe('LibraryRepository.upsertLibrary.nse');
    })
  );

  iit.effect(
    'should fail to rename a library to an existing library name',
    Effect.fnUntraced(function* () {
      const client = yield* makeAuthedClient({ username: 'default', role: 'admin' });

      yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Existing Name Library',
        absolutePaths: [],
      });
      const library = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'show',
        name: 'Rename Collision Library',
        absolutePaths: [],
      });

      const result = yield* client
        .libraryUpsert({
          id: Option.some(library.id),
          type: 'show',
          name: 'Existing Name Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      if (!Schema.is(DatabaseErrorWithNSE)(result)) {
        throw new Error('Expected a DatabaseError');
      }
      expect(result.reason).toBeInstanceOf(DatabaseSqlError);
      if (!Schema.is(DatabaseSqlError)(result.reason)) {
        throw new Error('Expected a DatabaseSqlError');
      }
      expect(result.reason.operation).toBe('LibraryRepository.upsertLibrary.sql');
    })
  );
});
