import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { Library } from '@repo/spec-api/groups/library.ts';

import { LibraryRpcGroupLayer } from '#src/groups/library.ts';
import { ApiConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';
import { LibraryRepository } from '#src/services/database/repos/library.ts';

const TestLayer = LibraryRpcGroupLayer.pipe(
  Layer.provideMerge(LibraryRepository.layer),
  Layer.provideMerge(DatabaseLive),
  Layer.provideMerge(ApiConfig.layerTest({ AUTH_SECRET: 'test', DB_FILENAME: ':memory:' }))
);

it.effect('should create a library', () =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(Library);

    const result = yield* client.libraryCreate({
      type: 'movie',
      name: 'My Movies',
      paths: ['/movies/action'],
    });

    expect(result.name).toBe('My Movies');
    expect(result.type).toBe('movie');
    expect(result.paths).toEqual(['/movies/action']);
    expect(typeof result.id).toBe('number');
  }).pipe(Effect.provide(TestLayer))
);
