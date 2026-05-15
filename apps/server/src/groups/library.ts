import { Array, Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import { Api } from '@repo/spec-api';
import type { ApiPayload } from '@repo/spec-api';
import { toDatabaseError } from '@repo/spec-api/database/index.ts';

import { LibraryRepository } from '#src/services/database/repos/library.ts';

const upsertLibrary = Effect.fnUntraced(function* (
  repository: LibraryRepository['Service'],
  payload: ApiPayload<'libraryUpsert'>
) {
  const library = yield* repository.upsertLibrary({
    id: payload.id,
    type: payload.type,
    name: payload.name,
  });
  yield* repository.removeOtherPaths({
    libraryId: library.id,
    absolutePaths: payload.absolutePaths,
  });
  if (Array.isReadonlyArrayNonEmpty(payload.absolutePaths)) {
    yield* repository.upsertPaths({
      libraryId: library.id,
      absolutePaths: payload.absolutePaths,
    });
    // TODO: Trigger a scan, and also clean up related tables based on the library type
  }
  return { id: library.id };
});

export const LibraryHandlers = Layer.mergeAll(
  Api.toLayerHandler('libraryGet', (payload) => LibraryRepository.use((r) => r.get(payload))),
  Api.toLayerHandler('libraryList', (payload) => LibraryRepository.use((r) => r.list(payload))),
  Api.toLayerHandler(
    'libraryUpsert',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryUpsert'>) {
      const repository = yield* LibraryRepository;
      const sql = yield* SqlClient.SqlClient;

      return yield* upsertLibrary(repository, payload).pipe(
        sql.withTransaction,
        toDatabaseError('Library.upsert')
      );
    })
  ),
  Api.toLayerHandler(
    'libraryDelete',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryDelete'>) {
      const repository = yield* LibraryRepository;
      const sql = yield* SqlClient.SqlClient;

      return yield* repository
        .deletePaths({ libraryId: payload.id })
        .pipe(
          Effect.andThen(repository.deleteLibrary({ id: payload.id })),
          sql.withTransaction,
          toDatabaseError('Library.delete')
        );
    })
  )
);
