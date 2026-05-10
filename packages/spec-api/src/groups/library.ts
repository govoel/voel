import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { DatabaseError, DatabaseErrorWithNSE } from '#src/database/index.ts';
import { LibraryTable, MediaTypes } from '#src/database/library.ts';

export const Library = RpcGroup.make()
  .add(
    Rpc.make('Get', {
      payload: Schema.Struct({ id: LibraryTable.fields.id }),
      success: LibraryTable,
      error: DatabaseErrorWithNSE,
    })
  )
  .add(
    Rpc.make('Upsert', {
      payload: Schema.Struct({
        id: Schema.Option(LibraryTable.fields.id),
        type: MediaTypes,
        name: Schema.String,
        absolutePaths: Schema.Array(Schema.String),
      }),
      success: Schema.Struct({ id: LibraryTable.fields.id }),
      error: DatabaseErrorWithNSE,
    })
  )
  .add(
    Rpc.make('Delete', {
      payload: Schema.Struct({ id: LibraryTable.fields.id }),
      success: Schema.Void,
      error: DatabaseError,
    })
  )
  .prefix('library');
