import { Hash } from './hash';
import { effectify } from '@effect/platform/Effectify';
import * as Error from '@effect/platform/Error';
import { $, type SystemError } from 'bun';
import { Cause, Data, Effect, Layer, Schema } from 'effect';
import {
  type OpenMode,
  type PathLike,
  access,
  close,
  constants as fsConstants,
  lstat,
  open,
  readSync,
  realpath,
  stat,
} from 'node:fs';
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

      // Bun.file can throw this when `Bun.file()` without args is called
      case 'ERR_INVALID_ARG_TYPE':
        reason = 'InvalidData';
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

export const makeFsExtended = () =>
  Effect.gen(function* () {
    const hash = yield* Hash;

    return {
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

      open: (() => {
        const nodeOpen = effectify(
          open,
          handleErrnoException('FileSystem', 'open'),
          handleBadArgument('open')
        );
        const nodeClose = effectify(
          close,
          handleErrnoException('FileSystem', 'close'),
          handleBadArgument('close')
        );
        return (path: PathLike, flags: OpenMode) =>
          Effect.acquireRelease(nodeOpen(path, flags), (fd) => Effect.orDie(nodeClose(fd)));
      })(),

      ffprobe: (fd: number) =>
        Effect.tryPromise({
          try: () =>
            $`ffprobe -v quiet -print_format json -show_error -show_format -show_chapters -show_streams - < ${Bun.file(fd)}`
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

      // we can't use Bun.file(fd).slice(0, 4096) because the fd gets its seek position left at 4096,
      // and there is no way to reset it without closing and reopening the file.
      partialHash: (fd: number) =>
        Effect.gen(function* () {
          const buffer = new Uint8Array(4096);

          const bytesRead = yield* Effect.try({
            try: () => readSync(fd, buffer, 0, buffer.length, 0),
            catch: (error) =>
              handleErrnoException('FileSystem', 'file')(error as SystemError, [
                (error as SystemError)?.path ?? 'file path not applicable',
              ]),
          });

          return yield* hash.rapidhash(buffer.subarray(0, bytesRead));
        }),
    };
  });

export class FsExtended extends Effect.Service<FsExtended>()('FsExtended', {
  effect: makeFsExtended(),
  dependencies: [Hash.Default],
}) {}

export const makeFsExtendedNoop = (fsExtended: Partial<FsExtended>) =>
  new FsExtended({
    access: () => Effect.die('not implemented'),
    realpath: () => Effect.die('not implemented'),
    lstat: () => Effect.die('not implemented'),
    stat: () => Effect.die('not implemented'),
    opendir: () => Effect.die('not implemented'),
    open: () => Effect.die('not implemented'),
    ffprobe: () => Effect.die('not implemented'),
    partialHash: () => Effect.die('not implemented'),
    ...fsExtended,
  });

export const layerNoop = (fsExtended: Partial<FsExtended>) =>
  Layer.succeed(FsExtended, makeFsExtendedNoop(fsExtended));
