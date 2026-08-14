import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

import { Library, LibraryPath } from '#src/database/schema.ts';
import { makeCursorPaginated } from '#src/groups/utils.ts';
import { AdminMiddleware } from '#src/middlewares/auth.ts';

export class LibraryNotFoundError extends Schema.TaggedError<
  LibraryNotFoundError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryNotFoundError')('LibraryNotFoundError', {
  id: Library.json.fields.id,
}) {}

export class LibraryNameConflictError extends Schema.TaggedError<
  LibraryNameConflictError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryNameConflictError')('LibraryNameConflictError', {
  name: Library.jsonUpdate.fields.name,
}) {}

export class InvalidLibraryPathError extends Schema.TaggedError<
  InvalidLibraryPathError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/InvalidLibraryPathError')('InvalidLibraryPathError', {
  paths: Schema.NonEmptyArray(LibraryPath.jsonUpdate.fields.absolutePath),
}) {}

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
    error: LibraryNotFoundError,
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
    error: Schema.Union([LibraryNotFoundError, LibraryNameConflictError, InvalidLibraryPathError], {
      mode: 'oneOf',
    }),
  }).middleware(AdminMiddleware),

  Rpc.make('libraryDelete', {
    payload: Schema.Struct({ id: Library.json.fields.id }),
    success: Schema.Void,
  }).middleware(AdminMiddleware),
];
