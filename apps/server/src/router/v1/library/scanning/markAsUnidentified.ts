import { Path } from '@effect/platform';
import { Effect } from 'effect';
import type { Insertable } from 'kysely';

import { db, toEffect } from '@/libs/db';
import type { UnidentifiedAudiobookFileTable } from '@/libs/db/schema';

export const markAsUnidentified = Effect.fn(function* ({
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
  reason: Insertable<UnidentifiedAudiobookFileTable>['reason'];
}) {
  const path = yield* Path.Path;

  const dbPaths = yield* toEffect(
    db
      .insertInto('unidentifiedAudiobookFile')
      .values(
        files.map((file) => ({
          libraryId,
          path: path.join(file.parentPath, file.name),
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
          path: eb.ref('excluded.path'),
          durationMs: eb.ref('excluded.durationMs'),
          disc: eb.ref('excluded.disc'),
          track: eb.ref('excluded.track'),
          reason: eb.ref('excluded.reason'),
          metadata: eb.ref('excluded.metadata'),
        }))
      )
      .returning(['path'])
      .execute()
  );

  yield* Effect.forEach(dbPaths, (dbPath) =>
    Effect.logInfo('Marked as unidentified').pipe(Effect.annotateLogs('path', dbPath.path))
  );
});
