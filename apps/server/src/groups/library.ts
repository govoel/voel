import { Effect } from 'effect';

import { Library } from '@repo/spec-api/groups/library.ts';

import { LibraryRepository } from '#src/services/database/repos/library.ts';

export const LibraryRpcGroupLayer = Library.toLayer(
  Effect.gen(function* () {
    const libraryRepo = yield* LibraryRepository;

    return Library.of({
      'library.create': (payload) => libraryRepo.upsert(payload),
    });
  })
);
