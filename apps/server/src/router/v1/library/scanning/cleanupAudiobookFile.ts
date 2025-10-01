import { Path } from '@effect/platform';
import { Effect, Option, Stream } from 'effect';

import { FsExtended } from '@/router/v1/library/fsExtended';

import { db, handleKyselyError, toEffect } from '@/libs/db';

const deleteAudiobookFile = Effect.fn(function* ({
  path,
  logMessage,
}: {
  path: string;
  logMessage: string;
}) {
  yield* toEffect(
    db
      .updateTable('audiobookFile')
      .where('path', '=', path)
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .execute()
  );

  yield* Effect.logInfo(logMessage).pipe(Effect.annotateLogs('path', path));
});

export const cleanupAudiobookFile = Effect.fn(
  function* ({ libraryId, ignoredDirs }: { libraryId: number; ignoredDirs: Set<string> }) {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;

    const cleanupPaths = {
      missing: [] as string[],
      ignore: [] as string[],
    };

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
        Effect.gen(function* () {
          const fileExists = yield* fs.access(file.path).pipe(Effect.option);

          if (Option.isNone(fileExists)) {
            cleanupPaths.missing.push(file.path);
          }

          if (ignoredDirs.has(path.dirname(file.path))) {
            cleanupPaths.ignore.push(file.path);
          }
        })
      ),
      Stream.runDrain
    );

    for (const path of cleanupPaths.missing) {
      yield* deleteAudiobookFile({
        path,
        logMessage: 'File not found, so deleting file from library database',
      });
    }

    for (const path of cleanupPaths.ignore) {
      yield* deleteAudiobookFile({
        path,
        logMessage:
          "File's directory has .nomedia/.voelignore, so deleting file from library database",
      });
    }
  },
  (effect, { libraryId }) =>
    effect.pipe(
      Effect.annotateLogs('libraryId', libraryId),
      Effect.catchAll((error) =>
        Effect.logError('Error while cleaning up audiobook files').pipe(
          Effect.annotateLogs('error', error)
        )
      )
    )
);
