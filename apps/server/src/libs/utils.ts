import { SystemError, type SystemErrorReason } from '@effect/platform/Error';
import type { PathLike as BunPathLike } from 'bun';
import type { PathLike as NodePathLike } from 'node:fs';

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

/**
 * Calculate the Levenshtein distance between two strings
 * Used for ordering search results by similarity
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let i = 1; i <= a.length; i++) {
    matrix[0]![i] = i;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        matrix[j]![i] = matrix[j - 1]![i - 1]!;
      } else {
        matrix[j]![i] = Math.min(
          matrix[j - 1]![i - 1]! + 1, // substitution
          matrix[j]![i - 1]! + 1, // insertion
          matrix[j - 1]![i]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}
