import { Schema } from 'effect';

export const MediaTypes = Schema.Literals(['audiobook', 'movie', 'show']);
export const LibraryTable = Schema.Struct({
  id: Schema.Int.pipe(Schema.brand('LibraryId')),
  name: Schema.String.pipe(Schema.brand('LibraryName')),
  type: MediaTypes,
  paths: Schema.NonEmptyArray(Schema.String.pipe(Schema.brand('LibraryPath'))),
});
