import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';

import type { ColumnType } from '@repo/source-tap';

class Timestamped extends Model.Class<Timestamped>('@repo/spec-api/database/Timestamped')({
  createdAt: Model.Field({
    select: Schema.Int,
    json: Schema.Int,
  }),
  updatedAt: Model.Field({
    select: Schema.Int,
    json: Schema.Int,
  }),
  deletedAt: Model.Field({
    select: Schema.NullOr(Schema.Int),
    update: Schema.NullOr(Schema.Int),
    json: Schema.NullOr(Schema.Int),
  }),
}) {}

type TimesampedTable = TableFromModel<typeof Timestamped>;

class MediaType extends Model.Class<MediaType>('@repo/spec-api/database/MediaType')({
  type: Model.Field({
    select: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
      Schema.brand('@repo/spec-api/database/MediaType/type')
    ),
    json: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
      Schema.brand('@repo/spec-api/database/MediaType/type')
    ),
  }),
}) {}

type MediaTypesTable = TableFromModel<typeof MediaType>;

class MediaItem extends Model.Class<MediaItem>('@repo/spec-api/database/MediaItem')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/database/MediaItem/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/database/MediaItem/id')),
  }),
  type: Model.Field({ select: MediaType.fields.type, json: MediaType.fields.type }),
  ...Timestamped.fields,
}) {}

type MediaItemTable = TableFromModel<typeof MediaItem>;

class Audiobook extends Model.Class<Audiobook>('@repo/spec-api/database/Audiobook')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/database/Audiobook/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/database/Audiobook/id')),
  }),
  asin: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/asin'))
    ),
    json: Schema.NullOr(Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/asin'))),
  }),
  mediaItemId: Model.Field({
    select: MediaItem.fields.id,
    json: MediaItem.fields.id,
  }),
  title: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/title')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/title')),
  }),
  subtitle: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/subtitle'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/subtitle'))
    ),
  }),
  cover: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/cover'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/cover'))
    ),
  }),
  coverThumbhash: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/coverThumbhash'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/coverThumbhash'))
    ),
  }),
  summary: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/Audiobook/summary'))
    ),
  }),
  ...Timestamped.fields,
}) {}

type AudiobookTable = TableFromModel<typeof Audiobook>;

class Library extends Model.Class<Library>('@repo/spec-api/database/Library')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/database/Library/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/database/Library/id')),
  }),
  type: Model.Field({
    select: MediaType.fields.type,
    json: MediaType.fields.type,
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/Library/name')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/Library/name')),
  }),
  ...Timestamped.fields,
}) {}

type LibraryTable = TableFromModel<typeof Library>;

type FieldType<F> = F extends Schema.Top ? Schema.Schema.Type<F> : never;

type FieldValue<Fields, K extends PropertyKey> = K extends keyof Fields
  ? FieldType<Fields[K]>
  : never;

type TableFromModel<M extends Model.Any> = M extends {
  readonly select: { readonly fields: infer SelectFields };
  readonly insert: { readonly fields: infer InsertFields };
  readonly update: { readonly fields: infer UpdateFields };
}
  ? {
      [K in keyof SelectFields]: ColumnType<
        FieldValue<SelectFields, K>,
        FieldValue<InsertFields, K>,
        FieldValue<UpdateFields, K>
      >;
    }
  : never;
