import { Schema } from 'effect';

export const MediaType = Schema.Literals(['audiobook', 'movie', 'show']).pipe(
  Schema.brand('@govoel/plugins/library/MediaType')
);

export class Library extends Schema.Struct({
  id: Schema.Natural.pipe(Schema.brand('@govoel/plugins/library/Library/id')),
  type: MediaType,
  /** Mutable display metadata, not a stable storage namespace. */
  name: Schema.String.pipe(Schema.brand('@govoel/plugins/library/Library/name')),
}) {}
