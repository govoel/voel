import { Path } from '@effect/platform';
import { Effect, Either, Option } from 'effect';
import type { Dirent } from 'node:fs';

import { FsExtended } from '@/router/v1/library/fsExtended';

import { db, toEffect } from '@/libs/db';

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'm4b',
  'mp3',
  'm4a',
  'flac',
  'opus',
  'ogg',
  'oga',
  'mp4',
  'aac',
  'wma',
  'aiff',
  'wav',
  'webm',
  'webma',
  'mka',
  'awb',
  'caf',
  'mpg',
  'mpeg',
]);

export const prepareAudiobookFile = (entry: Dirent<string>) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;

    yield* Effect.annotateLogsScoped({ path: path.join(entry.parentPath, entry.name) });

    if (entry.isDirectory()) {
      yield* Effect.logDebug('Ignoring directory');
      return Option.none();
    }

    // we stat because we cannot detect both symbolic links and directories using opendir,
    // even with `{ withFileTypes: true }`, if it is a symbolic link, `isSymbolicLink()` is `true`
    // and `isDirectory()` is `false` even if the symbolic link points to a directory
    const stat = yield* Effect.either(fs.stat(path.join(entry.parentPath, entry.name)));

    if (Either.isLeft(stat)) {
      yield* Effect.logError('Error getting file info').pipe(
        Effect.annotateLogs('error', stat.left.message)
      );
      return Option.none();
    }

    if (stat.right.isDirectory()) {
      yield* Effect.logDebug('Ignoring directory');
      return Option.none();
    }

    const lastDotIndex = entry.name.lastIndexOf('.');
    if (lastDotIndex === -1) {
      yield* Effect.logDebug('Ignoring file without extension');
      return Option.none();
    }

    if (!SUPPORTED_AUDIO_EXTENSIONS.has(entry.name.substring(lastDotIndex + 1).toLowerCase())) {
      yield* Effect.logDebug('Ignoring file with unsupported extension').pipe(
        Effect.annotateLogs('extension', entry.name.substring(lastDotIndex + 1))
      );
      return Option.none();
    }

    const dbFile = yield* Effect.either(
      toEffect(
        db
          .selectFrom('audiobookFile')
          .select(['audiobookFile.mtimeMs', 'audiobookFile.metadataHash'])
          .where('audiobookFile.path', '=', path.join(entry.parentPath, entry.name))
          .executeTakeFirst()
      )
    );

    if (Either.isLeft(dbFile)) {
      yield* Effect.logError('Error fetching file from database, ignoring', dbFile.left);
      return Option.none();
    }

    if (dbFile.right && stat.right.mtimeMs <= dbFile.right.mtimeMs) {
      yield* Effect.log('File is up to date, ignoring');
      return Option.none();
    }

    let realPath: string | undefined = undefined;
    if (entry.isSymbolicLink()) {
      const realPathEither = yield* Effect.either(
        fs.realpath(path.join(entry.parentPath, entry.name))
      );

      if (Either.isLeft(realPathEither)) {
        yield* Effect.logError('Error resolving symbolic link').pipe(
          Effect.annotateLogs('error', realPathEither.left.message)
        );
        return Option.none();
      } else {
        realPath = realPathEither.right;
      }
    }

    return Option.some({
      metadataHashFromDb: dbFile.right?.metadataHash,
      mtimeMs: stat.right.mtimeMs,
      parentPath: entry.parentPath,
      name: entry.name,
      realPath,
    });
  }).pipe(Effect.scoped);
