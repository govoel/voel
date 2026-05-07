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
    Effect.fn(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

      const result = yield* client.libraryCreate({
        type,
        name: `My ${type}`,
        paths: [`/${type}/path`],
      });

      expect(result.name).toBe(`My ${type}`);
      expect(result.type).toBe(type);
      expect(result.paths).toEqual([`/${type}/path`]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library with multiple paths',
    Effect.fn(function* (type) {
      const client = yield* RpcTest.makeClient(Library);

      const result = yield* client.libraryCreate({
        type,
        name: `My ${type} Multi`,
        paths: [`/${type}/path1`, `/${type}/path2`],
      });

      expect(result.name).toBe(`My ${type} Multi`);
      expect(result.type).toBe(type);
      expect(result.paths).toEqual([`/${type}/path1`, `/${type}/path2`]);
      expect(result.id).toBeTypeOf('number');
    })
  );
});
