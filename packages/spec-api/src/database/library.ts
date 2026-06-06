import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';

export const MediaTypes = Schema.Literals(['audiobook', 'movie', 'show']);

const LibraryAbsolutePaths = Schema.Array(Schema.String.pipe(Schema.brand('LibraryAbsolutePath')));

export class LibraryTable extends Model.Class<LibraryTable>('LibraryTable')({
  id: Model.Generated(Schema.Int.pipe(Schema.brand('LibraryId'))),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('LibraryName')),
    insert: Schema.String,
    update: Schema.String,
    json: Schema.String.pipe(Schema.brand('LibraryName')),
    jsonCreate: Schema.String,
    jsonUpdate: Schema.String,
  }),
  type: MediaTypes.pipe(Schema.brand('LibraryMediaType')),
  absolutePaths: Model.Field({
    select: LibraryAbsolutePaths,
    insert: LibraryAbsolutePaths,
    update: LibraryAbsolutePaths,
    json: Schema.toEncoded(LibraryAbsolutePaths),
    jsonCreate: Schema.toEncoded(LibraryAbsolutePaths),
    jsonUpdate: Schema.toEncoded(LibraryAbsolutePaths),
  }),
}) {}
