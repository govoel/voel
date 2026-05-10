import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { MediaTypes } from '@repo/spec-api/database/library.js';
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

it.layer(TestLayer)('library', (iit) => {
  iit.effect.each(MediaTypes.literals)(
    'should create a %s library',
    Effect.fnUntraced(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

      const result = yield* client
        .libraryUpsert({
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
        type,
        name: `My ${type} Delete`,
        absolutePaths: [`/${type}/path-delete`],
      });

      yield* client.libraryDelete({ id: result1.id });

      const result2 = yield* client
        .libraryUpsert({
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

      const result1 = yield* client.libraryUpsert({
        type,
        name: `My ${type} Paths`,
        absolutePaths: [`/${type}/path-keep`],
      });

      const result2 = yield* client
        .libraryUpsert({
          type,
          name: `My ${type} Paths`,
          absolutePaths: [`/${type}/path-new`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.absolutePaths).toEqual([`/${type}/path-keep`, `/${type}/path-new`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    '%s library type should not change on upsert',
    Effect.fnUntraced(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

      const result1 = yield* client.libraryUpsert({
        type,
        name: `My ${type} Type`,
        absolutePaths: [`/${type}/path-type`],
      });

      // eslint-disable-next-line eslnt/no-non-null-assertion
      const differentType = MediaTypes.literals.find((l) => l !== type)!;

      const result2 = yield* client
        .libraryUpsert({
          type: differentType,
          name: `My ${type} Type`,
          absolutePaths: [`/${type}/path-type`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.type).toBe(type);
    })
  );
});
