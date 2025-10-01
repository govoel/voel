import { Data, Effect } from 'effect';

import { db, toEffect } from '@/libs/db';

class DatabaseError extends Data.TaggedError('DatabaseError') {}

export const deleteAudiobookFile = ({ path }: { path: string }) =>
  toEffect(
    db
      .updateTable('audiobookFile')
      .where('audiobookFile.path', '=', path)
      // ensures we don't update deletedAt when it is already deleted and cause unnecessary realtime updates
      .where('audiobookFile.deletedAt', 'is', null)
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .execute()
  ).pipe(
    Effect.catchTags({
      NotFoundError: () => Effect.fail(new DatabaseError()),
      QueryError: () => Effect.fail(new DatabaseError()),
      KnownSQLiteError: () => Effect.fail(new DatabaseError()),
    })
  );
