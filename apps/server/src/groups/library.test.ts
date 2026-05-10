import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Schema, SchemaGetter } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { DatabaseDecodeError } from '@repo/spec-api/database/index.js';
import { LibraryTable, MediaTypes } from '@repo/spec-api/database/library.ts';
import { Library } from '@repo/spec-api/groups/library.ts';

import { LibraryRpcGroupLayer } from '#src/groups/library.ts';
import { ApiConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';
import { LibraryRepository } from '#src/services/database/repos/library.ts';

const TestLayer = LibraryRpcGroupLayer.pipe(
  Layer.provideMerge(LibraryRepository.layer),
  Layer.provideMerge(DatabaseLive),
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

it.layer(TestLayer)('library', (iit) => {
  iit.effect.each(MediaTypes.literals)(
    'should create a %s library',
    Effect.fnUntraced(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

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
      const client = yield* RpcTest.makeClient(Library);

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
      const client = yield* RpcTest.makeClient(Library);

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

  iit.effect.each(MediaTypes.literals)(
    'should soft delete a %s library and recreate it',
    Effect.fnUntraced(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

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
    '%s library paths should not get deleted on upsert',
    Effect.fnUntraced(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

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
    'name changes for %s library is supported',
    Effect.fnUntraced(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

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
      const client = yield* RpcTest.makeClient(Library);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Type`,
        absolutePaths: [`/${type}/path-type`],
      });

      // eslint-disable-next-line eslnt/no-non-null-assertion
      const differentType = MediaTypes.literals.find((l) => l !== type)!;

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
      const client = yield* RpcTest.makeClient(Library);

      const result = yield* client
        .libraryGet({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);

      expect(result).toBeInstanceOf(DatabaseDecodeError);
    })
  );

  iit.effect(
    'should fail to get a deleted library',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(Library);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: `Deleted Library`,
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result1.id });

      const result2 = yield* client.libraryGet({ id: result1.id }).pipe(Effect.flip);

      expect(result2).toBeInstanceOf(DatabaseDecodeError);
    })
  );

  iit.effect(
    'should succeed in deleting a non-existent library',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(Library);

      yield* client.libraryDelete({ id: yield* forceBrandLibraryId(999_999) });
    })
  );

  iit.effect(
    'should fail to upsert with a non-existent id',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(Library);

      const result = yield* client
        .libraryUpsert({
          id: Option.some(yield* forceBrandLibraryId(999_999)),
          type: 'movie',
          name: 'Ghost Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      expect(result).toBeInstanceOf(DatabaseDecodeError);
    })
  );
});
