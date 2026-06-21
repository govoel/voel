import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

import { DatabaseNseError, DatabaseSqlError } from '@repo/effect-kysely';

import { Library, LibraryPath } from '#src/database/schema.ts';
import { makeCursorPaginated } from '#src/groups/utils.ts';
import { AdminMiddleware } from '#src/middlewares/auth.ts';

export const library = [
  makeCursorPaginated('libraryList', {
    cursor: Library.json.fields.id,
    success: Schema.Struct({
      id: Library.json.fields.id,
      type: Library.json.fields.type,
      name: Library.json.fields.name,
      absolutePaths: Schema.Array(
        Schema.Struct({
          id: LibraryPath.json.fields.id,
          absolutePath: LibraryPath.json.fields.absolutePath,
        })
      ),
    }),
    error: DatabaseSqlError,
  }),

  Rpc.make('libraryGet', {
    payload: Schema.Struct({ id: Library.json.fields.id }),
    success: Schema.Struct({
      id: Library.json.fields.id,
      type: Library.json.fields.type,
      name: Library.json.fields.name,
      absolutePaths: Schema.Array(
        Schema.Struct({
          id: LibraryPath.json.fields.id,
          absolutePath: LibraryPath.json.fields.absolutePath,
        })
      ),
    }),
    error: Schema.Union([DatabaseSqlError, DatabaseNseError], { mode: 'oneOf' }),
  }),

  Rpc.make('libraryUpsert', {
    payload: Schema.Struct({
      id: Library.jsonUpdate.fields.id,
      type: Library.jsonUpdate.fields.type,
      name: Library.jsonUpdate.fields.name,
      absolutePaths: Schema.Array(
        Schema.Struct({
          absolutePath: LibraryPath.jsonUpdate.fields.absolutePath,
        })
      ),
    }),
    success: Schema.Struct({ id: Library.fields.id }),
    error: Schema.Union(
      [DatabaseSqlError, DatabaseNseError, Schema.instanceOf(Schema.SchemaError)],
      { mode: 'oneOf' }
    ),
  }).middleware(AdminMiddleware),

  Rpc.make('libraryDelete', {
    payload: Schema.Struct({ id: Library.json.fields.id }),
    success: Schema.Void,
    error: DatabaseSqlError,
  }).middleware(AdminMiddleware),
];
