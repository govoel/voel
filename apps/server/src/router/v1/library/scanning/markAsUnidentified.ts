import { Data, Effect } from 'effect';
import type { Insertable } from 'kysely';

import { db, toEffect } from '@/libs/db';
import type { AudiobookFileTable } from '@/libs/db/schema';

class DatabaseError extends Data.TaggedError('DatabaseError') {}

export const markAsUnidentified = ({
  libraryId,
  files,
  reason,
}: {
  libraryId: number;
  files: {
    path: string;
    discNumber: number;
    trackNumber: number;
    mtimeMs: number;
    metadata: { format: { duration: number } };
  }[];
  reason: Insertable<AudiobookFileTable>['reason'];
}) =>
  toEffect(
    db
      .insertInto('audiobookFile')
      .values(
        files.map((file) => ({
          libraryId,
          bookId: null,
          partialFileHash: null,
          reason,
          path: file.path,
          durationMs: Math.round(file.metadata.format.duration * 1000),
          disc: file.discNumber,
          track: file.trackNumber,
          mtimeMs: file.mtimeMs,
        }))
      )
      .onConflict((oc) =>
        oc.doUpdateSet((eb) => ({
          libraryId: eb.ref('excluded.libraryId'),
          bookId: eb.ref('excluded.bookId'),
          partialFileHash: eb.ref('excluded.partialFileHash'),
          reason: eb.ref('excluded.reason'),
          path: eb.ref('excluded.path'),
          durationMs: eb.ref('excluded.durationMs'),
          disc: eb.ref('excluded.disc'),
          track: eb.ref('excluded.track'),
          mtimeMs: eb.ref('excluded.mtimeMs'),
          deletedAt: null,
        }))
      )
      .returning(['path'])
      .execute()
  ).pipe(
    Effect.catchTags({
      NotFoundError: () => Effect.fail(new DatabaseError()),
      QueryError: () => Effect.fail(new DatabaseError()),
      KnownSQLiteError: () => Effect.fail(new DatabaseError()),
    })
  );
