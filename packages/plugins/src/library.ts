import { Schema } from 'effect';

/** Media categories shared by libraries and media items. */
export const MediaType = Schema.Literals(['audiobook', 'movie', 'show']).pipe(
  Schema.brand('@govoel/plugins/library/MediaType')
);

/** Persisted library context shared by the host and plugins. */
export class Library extends Schema.Struct({
  id: Schema.Natural.pipe(Schema.brand('@govoel/plugins/library/Library/id')),
  type: MediaType,
  /** Mutable display metadata, not a stable storage namespace. */
  name: Schema.String.pipe(Schema.brand('@govoel/plugins/library/Library/name')),
}) {}
