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
    metadata: { format: { duration: number } };
    normalizedTags: Record<string, string>;
  }[];
  reason: Insertable<UnmatchedAudiobookFileTable>['reason'];
}) {
  const path = yield* Path.Path;

  const dbPaths = yield* toEffect(
    db
      .insertInto('unmatchedAudiobookFile')
      .values(
        files.map((file) => ({
          libraryId,
          parentPath: file.parentPath,
          name: file.name,
          durationMs: Math.round(file.metadata.format.duration * 1000),
          disc: file.discNumber,
          track: file.trackNumber,
          metadata: JSON.stringify(file.normalizedTags),
          reason,
        }))
      )
      .onConflict((oc) =>
        oc.doUpdateSet((eb) => ({
          libraryId: eb.ref('excluded.libraryId'),
          parentPath: eb.ref('excluded.parentPath'),
          name: eb.ref('excluded.name'),
          durationMs: eb.ref('excluded.durationMs'),
          disc: eb.ref('excluded.disc'),
          track: eb.ref('excluded.track'),
          reason: eb.ref('excluded.reason'),
          metadata: eb.ref('excluded.metadata'),
        }))
      )
      .returning(['parentPath', 'name'])
      .execute()
  );

  yield* Effect.forEach(dbPaths, (dbPath) =>
    Effect.logInfo('Marked as unmatched').pipe(
      Effect.annotateLogs('path', path.join(dbPath.parentPath, dbPath.name))
    )
  );
});
