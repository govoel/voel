import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Library, LibraryPath } from '#src/database/schema.ts';
import { makeCursorPaginated } from '#src/groups/utils.ts';
import { AdminMiddleware, AuthMiddleware } from '#src/middlewares/auth.ts';

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
  name: Library.jsonUpsert.fields.name,
}) {}

export class LibraryInvalidPathError extends Schema.TaggedError<
  LibraryInvalidPathError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryInvalidPathError')('LibraryInvalidPathError', {
  paths: Schema.NonEmptyArray(LibraryPath.jsonUpsert.fields.absolutePath),
}) {}

export const LibraryRpcs = RpcGroup.make(
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
      id: Library.jsonUpsert.fields.id,
      type: Library.jsonUpsert.fields.type,
      name: Library.jsonUpsert.fields.name,
      absolutePaths: Schema.Array(
        Schema.Struct({
          absolutePath: LibraryPath.jsonUpsert.fields.absolutePath,
        })
      ),
    }),
    success: Schema.Struct({ id: Library.json.fields.id }),
    error: Schema.Union([LibraryNotFoundError, LibraryNameConflictError, LibraryInvalidPathError], {
      mode: 'oneOf',
    }),
  }).middleware(AdminMiddleware),

  Rpc.make('libraryDelete', {
    payload: Schema.Struct({ id: Library.json.fields.id }),
    success: Schema.Void,
  }).middleware(AdminMiddleware)
).middleware(AuthMiddleware);
