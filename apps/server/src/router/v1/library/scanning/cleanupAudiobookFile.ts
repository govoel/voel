import { Path } from '@effect/platform';
import { Effect, Stream } from 'effect';

import { FsExtended } from '@/router/v1/library/fsExtended';

import { db, handleKyselyError, toEffect } from '@/libs/db';

export const cleanupAudiobookFile = Effect.fn(function* ({ libraryId }: { libraryId: number }) {
  const fs = yield* FsExtended;

  yield* Stream.fromAsyncIterable(
    db
      .selectFrom('audiobookFile')
      .where('audiobookFile.libraryId', '=', libraryId)
      .where('audiobookFile.deletedAt', 'is', null)
      .select('path')
      .stream(),
    handleKyselyError
  ).pipe(
    Stream.mapEffect((file) =>
      fs.access(file.path).pipe(
        Effect.catchAll(() =>
          Effect.gen(function* () {
            yield* toEffect(
              db
                .updateTable('audiobookFile')
                .where('path', '=', file.path)
                .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
                .execute()
            );

            yield* Effect.logInfo('File not found, so deleting file from library database').pipe(
              Effect.annotateLogs('path', file.path)
            );
          })
        )
      )
    ),
    Stream.runDrain,
    Effect.catchAll((error) =>
      Effect.logError('Error while cleaning up audiobook files').pipe(
        Effect.annotateLogs('error', error)
      )
    )
  );
});

export const cleanupUnmatchedAudiobookFile = Effect.fn(function* ({
  libraryId,
}: {
  libraryId: number;
}) {
  const path = yield* Path.Path;
  const fs = yield* FsExtended;

  yield* Stream.fromAsyncIterable(
    db
      .selectFrom('unmatchedAudiobookFile')
      .where('unmatchedAudiobookFile.libraryId', '=', libraryId)
      .where('unmatchedAudiobookFile.deletedAt', 'is', null)
      .select(['parentPath', 'name'])
      .stream(),
    handleKyselyError
  ).pipe(
    Stream.mapEffect((file) =>
      fs.access(path.join(file.parentPath, file.name)).pipe(
        Effect.catchAll(() =>
          Effect.gen(function* () {
            yield* toEffect(
              db
                .updateTable('unmatchedAudiobookFile')
                .where('parentPath', '=', file.parentPath)
                .where('name', '=', file.name)
                .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
                .execute()
            );

            yield* Effect.logInfo(
              'Unmatched file not found, so deleting file from library database'
            ).pipe(Effect.annotateLogs('path', path.join(file.parentPath, file.name)));
          })
        )
      )
    ),
    Stream.runDrain,
    Effect.catchAll((error) =>
      Effect.logError('Error while cleaning up unmatched files').pipe(
        Effect.annotateLogs('error', error)
      )
    )
  );
});
