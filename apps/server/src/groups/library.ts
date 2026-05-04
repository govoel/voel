import { Effect } from 'effect';

import { Library } from '@repo/spec-api/library.ts';

import { LibraryRepository } from '#src/services/database/repos/library.ts';

export const LibraryLayer = Library.toLayer(
  Effect.gen(function* () {
    const libraryRepo = yield* LibraryRepository;

    return Library.of({
      'library.create': Effect.fnUntraced(function* (payload) {
        const result = yield* libraryRepo.upsert(payload);
        return result;
      }),
    });
  })
);
