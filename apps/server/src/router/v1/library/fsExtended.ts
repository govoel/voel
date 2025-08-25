import { effectify } from '@effect/platform/Effectify';
import * as Error from '@effect/platform/Error';
import { $ } from 'bun';
import { Cause, Data, Effect, Schema } from 'effect';
import { type PathLike, access, constants as fsConstants, lstat, realpath, stat } from 'node:fs';
import { opendir } from 'node:fs/promises';

const handleErrnoException =
  (module: Error.SystemError['module'], method: string) =>
  (
    err: NodeJS.ErrnoException,
    [path]: [path: PathLike | number, ...args: Array<unknown>]
  ): Error.PlatformError => {
    let reason: Error.SystemErrorReason = 'Unknown';

    switch (err.code) {
      case 'ENOENT':
        reason = 'NotFound';
        break;

      case 'EACCES':
        reason = 'PermissionDenied';
        break;

      case 'EEXIST':
        reason = 'AlreadyExists';
        break;

      case 'EISDIR':
        reason = 'BadResource';
        break;

      case 'ENOTDIR':
        reason = 'BadResource';
        break;

      case 'EBUSY':
        reason = 'Busy';
        break;

      case 'ELOOP':
        reason = 'BadResource';
        break;
    }

    return new Error.SystemError({
      reason,
      module,
      method,
      pathOrDescriptor: path as string | number,
      syscall: err.syscall,
      description: err.message,
      cause: err,
    });
  };

/**
 * Creates a BadArgument error handler for filesystem operations.
 *
 * Used to wrap filesystem functions with proper Effect error handling
 * when arguments are invalid or malformed.
 *
 * @param method - The filesystem method name for error context
 * @returns Error handler function that creates BadArgument errors
 */
const handleBadArgument = (method: string) => (cause: unknown) =>
  new Error.BadArgument({
    module: 'FileSystem',
    method,
    cause,
  });

/**
 * Error class for known FFProbe failures with specific exit and error codes.
 */
class FFProbeKnownError extends Data.TaggedError('FFProbeKnownError')<{
  exitCode: number;
  errorCode: number;
  message: string;
}> {}

/**
 * Error class for unexpected FFProbe failures with stdout/stderr output.
 */
class FFProbeUnknownError extends Data.TaggedError('FFProbeUnknownError')<{
  exitCode: number;
  stdout: Buffer<ArrayBufferLike>;
  stderr: Buffer<ArrayBufferLike>;
}> {}

/**
 * Error class for Bun shell syntax errors during command execution.
 */
class BunShellSyntaxError extends Data.TaggedError('BunShellSyntaxError') {}

/**
 * Schema for validating FFProbe JSON output structure.
 *
 * Defines the expected format for audio file metadata including
 * chapters, format information, and embedded tags.
 */
export const FFProbeStdoutSchema = Schema.Struct({
  chapters: Schema.Array(
    Schema.Struct({
      id: Schema.Union(Schema.NumberFromString, Schema.Number),
      start_time: Schema.NumberFromString,
      end_time: Schema.NumberFromString,
      tags: Schema.Struct({ title: Schema.String }),
    })
  ),
  format: Schema.Struct({
    start_time: Schema.NumberFromString,
    duration: Schema.NumberFromString,
    tags: Schema.Record({ key: Schema.String, value: Schema.String }),
  }),
});

const FFProbeStdoutErrorSchema = Schema.Struct({
  error: Schema.Struct({
    code: Schema.Union(Schema.NumberFromString, Schema.Number),
    string: Schema.String,
  }),
});

interface AccessFileOptions {
  readonly ok?: boolean;
  readonly readable?: boolean;
  readonly writable?: boolean;
}

/**
 * Extended filesystem service with Effect integration and enhanced error handling.
 *
 * Provides filesystem operations wrapped with Effect for better error handling,
 * plus additional functionality like FFProbe for audio file metadata extraction.
 * All operations return Effect types for composable error handling.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const fs = yield* FsExtended;
 *   const stats = yield* fs.stat('/path/to/file');
 *   const metadata = yield* fs.ffprobe({ path: '/path/to/audio.mp3' });
 *   return { stats, metadata };
 * });
 * ```
 */
export class FsExtended extends Effect.Service<FsExtended>()('FsExtended', {
  succeed: {
    access: (() => {
      const nodeAccess = effectify(
        access,
        handleErrnoException('FileSystem', 'access'),
        handleBadArgument('access')
      );
      return (path: string, options?: AccessFileOptions) => {
        let mode = fsConstants.F_OK;
        if (options?.readable) {
          mode |= fsConstants.R_OK;
        }
        if (options?.writable) {
          mode |= fsConstants.W_OK;
        }
        return nodeAccess(path, mode);
      };
    })(),

    realpath: (() => {
      const nodeRealpath = effectify(
        realpath,
        handleErrnoException('FileSystem', 'realpath'),
        handleBadArgument('realpath')
      );
      return (path: string) => nodeRealpath(path);
    })(),

    lstat: (() => {
      const nodeLstat = effectify(
        lstat,
        handleErrnoException('FileSystem', 'lstat'),
        handleBadArgument('lstat')
      );
      return (path: string) => nodeLstat(path);
    })(),

    stat: (() => {
      const nodeStat = effectify(
        stat,
        handleErrnoException('FileSystem', 'stat'),
        handleBadArgument('stat')
      );
      return (path: string) => nodeStat(path);
    })(),

    opendir: ({
      path,
      options,
    }: {
      path: Parameters<typeof opendir>[0];
      options: Parameters<typeof opendir>[1];
    }) =>
      Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () => opendir(path, options),
          catch: (error) =>
            handleErrnoException('FileSystem', 'opendir')(error as NodeJS.ErrnoException, [
              path,
              options,
            ]),
        }),
        (dir) => Effect.succeed(dir),
        (dir) => Effect.sync(() => dir.closeSync())
      ),

    ffprobe: ({ path }: { path: string }) =>
      Effect.tryPromise({
        try: () =>
          $`ffprobe -v quiet -print_format json -show_error -show_format -show_chapters -show_streams ${path}`
            .quiet()
            .json() as Promise<unknown>,
        catch: (error) => {
          if (error instanceof $.ShellError) {
            try {
              const errorJSON = error.json();
              if (Schema.is(FFProbeStdoutErrorSchema)(errorJSON)) {
                return new FFProbeKnownError({
                  exitCode: error.exitCode,
                  errorCode: errorJSON.error.code,
                  message: errorJSON.error.string,
                });
              }
            } catch {
              // ignore that errorJSON can throw SyntaxError,
              // we silently fall through to FFProbeUnknownError
            }
            return new FFProbeUnknownError({
              exitCode: error.exitCode,
              stdout: error.stdout,
              stderr: error.stderr,
            });
          } else if (error instanceof SyntaxError) {
            return new BunShellSyntaxError();
          }
          return new Cause.UnknownException(error);
        },
      }).pipe(Effect.andThen(Schema.decodeUnknown(FFProbeStdoutSchema))),
  },

  dependencies: [],
}) {}
