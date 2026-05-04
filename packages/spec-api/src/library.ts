import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { SqlError } from 'effect/unstable/sql';

export const MediaTypes = Schema.Literals(['audiobook', 'movie', 'show']);
export const LibraryTable = Schema.Struct({
  id: Schema.Int.pipe(Schema.brand('LibraryId')),
  name: Schema.String.pipe(Schema.brand('LibraryName')),
  type: MediaTypes,
  paths: Schema.NonEmptyArray(Schema.String.pipe(Schema.brand('LibraryPath'))),
});

export const Library = RpcGroup.make()
  .add(
    Rpc.make('create', {
      payload: {
        type: MediaTypes,
        name: Schema.String,
        paths: Schema.NonEmptyArray(Schema.String),
      },
      success: LibraryTable,
      error: SqlError.SqlError,
    })
  )
  .prefix('library.');
