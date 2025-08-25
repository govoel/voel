import { SystemError, type SystemErrorReason } from '@effect/platform/Error';
import type { PathLike as BunPathLike } from 'bun';
import type { PathLike as NodePathLike } from 'node:fs';

/**
 * Creates an error handler that converts Node.js errno exceptions to Effect SystemErrors.
 * 
 * Maps common filesystem error codes to appropriate SystemError reasons,
 * providing better error handling integration with the Effect ecosystem.
 * 
 * @param module - The Effect module name for error context
 * @param method - The method name where the error occurred
 * @returns A handler function that converts errno exceptions to SystemErrors
 * 
 * @example
 * ```typescript
 * const errorHandler = handleErrnoException('FileSystem', 'readFile');
 * try {
 *   // some fs operation
 * } catch (err) {
 *   throw errorHandler(err, '/path/to/file');
 * }
 * ```
 */
export const handleErrnoException =
  (module: SystemError['module'], method: string) =>
  (err: NodeJS.ErrnoException, path: BunPathLike | NodePathLike): SystemError => {
    let reason: SystemErrorReason = 'Unknown';

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

    return new SystemError({
      reason,
      module,
      method,
      pathOrDescriptor: path as string | number,
      syscall: err.syscall,
      description: err.message,
      cause: err,
    });
  };
