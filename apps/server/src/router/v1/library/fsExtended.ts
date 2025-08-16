import { effectify } from '@effect/platform/Effectify';
import * as Error from '@effect/platform/Error';
import { $ } from 'bun';
import { Cause, Data, Effect, Schema } from 'effect';
import { type PathLike, realpath, stat } from 'node:fs';
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

const handleBadArgument = (method: string) => (cause: unknown) =>
  new Error.BadArgument({
    module: 'FileSystem',
    method,
    cause,
  });

class FFProbeKnownError extends Data.TaggedError('FFProbeKnownError')<{
  exitCode: number;
  errorCode: number;
  message: string;
}> {}

class FFProbeUnknownError extends Data.TaggedError('FFProbeUnknownError')<{
  exitCode: number;
  stdout: Buffer<ArrayBufferLike>;
  stderr: Buffer<ArrayBufferLike>;
}> {}

class BunShellSyntaxError extends Data.TaggedError('BunShellSyntaxError') {}

const FFProbeStdoutSchema = Schema.Struct({
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
    message: Schema.String,
  }),
});

export class FsExtended extends Effect.Service<FsExtended>()('FsExtended', {
  succeed: {
    realpath: (() => {
      const nodeRealpath = effectify(
        realpath,
        handleErrnoException('FileSystem', 'realpath'),
        handleBadArgument('realpath')
      );
      return (path: string) => nodeRealpath(path);
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
                  message: errorJSON.error.message,
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
