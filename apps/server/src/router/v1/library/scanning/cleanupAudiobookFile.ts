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
  function* ({ libraryId }: { libraryId: number }) {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;

    const cleanupPaths = {
      missing: [] as string[],
      nomedia: [] as string[],
      voelignore: [] as string[],
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

          const nomediaExists = yield* fs
            .access(path.join(path.dirname(file.path), '.nomedia'))
            .pipe(Effect.option);

          if (Option.isSome(nomediaExists)) {
            cleanupPaths.nomedia.push(file.path);
          }

          const voelignoreExists = yield* fs
            .access(path.join(path.dirname(file.path), '.voelignore'))
            .pipe(Effect.option);

          if (Option.isSome(voelignoreExists)) {
            cleanupPaths.voelignore.push(file.path);
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

    for (const path of cleanupPaths.nomedia) {
      yield* deleteAudiobookFile({
        path,
        logMessage: "File's directory has .nomedia, so deleting file from library database",
      });
    }

    for (const path of cleanupPaths.voelignore) {
      yield* deleteAudiobookFile({
        path,
        logMessage: "File's directory has .voelignore, so deleting file from library database",
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

const deleteUnidentifiedAudiobookFile = Effect.fn(function* ({
  path: filePath,
  logMessage,
}: {
  path: string;
  logMessage: string;
}) {
  yield* toEffect(
    db
      .updateTable('unidentifiedAudiobookFile')
      .where('path', '=', filePath)
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .execute()
  );

  yield* Effect.logInfo(logMessage).pipe(Effect.annotateLogs('path', filePath));
});

export const cleanupUnidentifiedAudiobookFile = Effect.fn(
  function* ({ libraryId }: { libraryId: number }) {
    const path = yield* Path.Path;
    const fs = yield* FsExtended;

    const cleanupPaths = {
      missing: [] as string[],
      nomedia: [] as string[],
      voelignore: [] as string[],
    };

    yield* Stream.fromAsyncIterable(
      db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.libraryId', '=', libraryId)
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select(['path'])
        .stream(),
      handleKyselyError
    ).pipe(
      Stream.mapEffect((file) =>
        Effect.gen(function* () {
          const fileExists = yield* fs.access(file.path).pipe(Effect.option);

          if (Option.isNone(fileExists)) {
            cleanupPaths.missing.push(file.path);
          }

          const nomediaExists = yield* fs
            .access(path.join(path.dirname(file.path), '.nomedia'))
            .pipe(Effect.option);

          if (Option.isSome(nomediaExists)) {
            cleanupPaths.nomedia.push(file.path);
          }

          const voelignoreExists = yield* fs
            .access(path.join(path.dirname(file.path), '.voelignore'))
            .pipe(Effect.option);

          if (Option.isSome(voelignoreExists)) {
            cleanupPaths.voelignore.push(file.path);
          }
        })
      ),
      Stream.runDrain
    );

    for (const path of cleanupPaths.missing) {
      yield* deleteUnidentifiedAudiobookFile({
        path,
        logMessage: 'Unidentified file not found, so deleting file from library database',
      });
    }

    for (const path of cleanupPaths.nomedia) {
      yield* deleteUnidentifiedAudiobookFile({
        path,
        logMessage:
          "Unidentified file's directory has .nomedia, so deleting file from library database",
      });
    }

    for (const path of cleanupPaths.voelignore) {
      yield* deleteUnidentifiedAudiobookFile({
        path,
        logMessage:
          "Unidentified file's directory has .voelignore, so deleting file from library database",
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
