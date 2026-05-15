import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

import { DatabaseError, DatabaseErrorWithNSE } from '#src/database/index.ts';
import { LibraryTable, MediaTypes } from '#src/database/library.ts';
import { makeCursorPaginated } from '#src/groups/utils.ts';
import { AdminMiddleware } from '#src/middlewares/auth.ts';

export const library = [
  makeCursorPaginated('libraryList', {
    cursor: LibraryTable.fields.id,
    success: LibraryTable,
    error: DatabaseError,
  }),

  Rpc.make('libraryGet', {
    payload: Schema.Struct({ id: LibraryTable.fields.id }),
    success: LibraryTable,
    error: DatabaseErrorWithNSE,
  }),

  Rpc.make('libraryUpsert', {
    payload: Schema.Struct({
      id: Schema.Option(LibraryTable.fields.id),
      type: MediaTypes,
      name: Schema.String,
      absolutePaths: Schema.Array(Schema.String),
    }),
    success: Schema.Struct({ id: LibraryTable.fields.id }),
    error: Schema.Union([DatabaseErrorWithNSE, Schema.instanceOf(Schema.SchemaError)], {
      mode: 'oneOf',
    }),
  }).middleware(AdminMiddleware),

  Rpc.make('libraryDelete', {
    payload: Schema.Struct({ id: LibraryTable.fields.id }),
    success: Schema.Void,
    error: DatabaseError,
  }).middleware(AdminMiddleware),
];
