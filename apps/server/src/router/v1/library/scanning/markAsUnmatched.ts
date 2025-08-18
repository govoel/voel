import { Path } from '@effect/platform';
import { Effect } from 'effect';
import type { Insertable } from 'kysely';

import { db, toEffect } from '@/libs/db';
import type { UnmatchedAudiobookFileTable } from '@/libs/db/schema';

export const markAsUnmatched = Effect.fn(function* ({
  libraryId,
  files,
  reason,
}: {
  libraryId: number;
  files: {
    parentPath: string;
    name: string;
    discNumber: number;
    trackNumber: number;
    metadata: { format: { duration: number; tags: Record<string, string> } };
  }[];
  reason: Insertable<UnmatchedAudiobookFileTable>['reason'];
}) {
  const path = yield* Path.Path;

  yield* toEffect(
    db
      .insertInto('unmatchedAudiobookFile')
      .values(
        files.map((file) => ({
          libraryId,
          path: path.join(file.parentPath, file.name),
          durationMs: Math.round(file.metadata.format.duration * 1000),
          disc: file.discNumber,
          track: file.trackNumber,
          metadata: JSON.stringify(file.metadata.format.tags),
          reason,
        }))
      )
      .onConflict((oc) =>
        oc.doUpdateSet((eb) => ({
          libraryId: eb.ref('excluded.libraryId'),
          path: eb.ref('excluded.path'),
          durationMs: eb.ref('excluded.durationMs'),
          disc: eb.ref('excluded.disc'),
          track: eb.ref('excluded.track'),
          reason: eb.ref('excluded.reason'),
          metadata: eb.ref('excluded.metadata'),
        }))
      )
      .returning('path')
      .execute()
  ).pipe(
    Effect.forEach((path) =>
      Effect.logInfo('Marked as unmatched').pipe(Effect.annotateLogs('path', path))
    )
  );
});
