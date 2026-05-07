import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { DatabaseError } from '#src/database/index.ts';
import { LibraryTable, MediaTypes } from '#src/database/library.ts';

export const Library = RpcGroup.make()
  .add(
    Rpc.make('Create', {
      payload: {
        type: MediaTypes,
        name: Schema.String,
        paths: Schema.NonEmptyArray(Schema.String),
      },
      success: LibraryTable,
      error: DatabaseError,
    })
  )
  .prefix('library');
