import { Path } from '@effect/platform';
import type { Error } from '@effect/platform';
import { Data, Effect, Either } from 'effect';

import { FsExtended } from '@/router/v1/library/fsExtended';

class DirectoryError extends Data.TaggedError('DirectoryError')<{ message: string }> {}
class StatError extends Data.TaggedError('StatError')<{
  message: string;
  error: Error.PlatformError;
}> {}
class RealpathError extends Data.TaggedError('RealpathError')<{
  message: string;
  error: Error.PlatformError;
}> {}
class NoExtensionError extends Data.TaggedError('NoExtensionError')<{ message: string }> {}
class UnsupportedExtensionError extends Data.TaggedError('UnsupportedExtensionError')<{
  message: string;
  extension: string;
}> {}

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

export const prepareAudiobookFile = (file: {
  parentPath: string;
  name: string;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;

    yield* Effect.annotateLogsScoped({ path: path.join(file.parentPath, file.name) });

    if (file.isDirectory()) {
      return yield* Effect.fail(new DirectoryError({ message: 'This is a directory' }));
    }

    // we stat because we cannot detect both symbolic links and directories using opendir,
    // even with `{ withFileTypes: true }`, if it is a symbolic link, `isSymbolicLink()` is `true`
    // and `isDirectory()` is `false` even if the symbolic link points to a directory
    const stat = yield* Effect.either(fs.stat(path.join(file.parentPath, file.name)));

    if (Either.isLeft(stat)) {
      return yield* Effect.fail(
        new StatError({ message: 'Error getting file info', error: stat.left })
      );
    }

    if (stat.right.isDirectory()) {
      return yield* Effect.fail(new DirectoryError({ message: 'This is a directory' }));
    }

    const lastDotIndex = file.name.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return yield* Effect.fail(new NoExtensionError({ message: 'File has no extension' }));
    }

    if (!SUPPORTED_AUDIO_EXTENSIONS.has(file.name.substring(lastDotIndex + 1).toLowerCase())) {
      return yield* Effect.fail(
        new UnsupportedExtensionError({
          message: 'Unsupported file extension',
          extension: file.name.substring(lastDotIndex + 1),
        })
      );
    }

    let realPath: string | undefined = undefined;
    if (file.isSymbolicLink()) {
      const realPathEither = yield* Effect.either(
        fs.realpath(path.join(file.parentPath, file.name))
      );

      if (Either.isLeft(realPathEither)) {
        return yield* Effect.fail(
          new RealpathError({
            message: 'Error resolving symbolic link',
            error: realPathEither.left,
          })
        );
      } else {
        realPath = realPathEither.right;
      }
    }

    return {
      mtimeMs: stat.right.mtimeMs,
      realPath,
    };
  }).pipe(Effect.scoped);
