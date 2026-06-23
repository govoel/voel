import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';

import type { TableFromModel } from '@repo/effect-kysely';

class Timestamped extends Model.Class<Timestamped>('@repo/spec-api/server/Timestamped')({
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
}) {
  public static readonly fullFields = Model.fields(this);
}

export class MediaType extends Model.Class<MediaType>('@repo/spec-api/server/MediaType')({
  type: Model.Field({
    select: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
      Schema.brand('@repo/spec-api/server/MediaType/type')
    ),
    json: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
      Schema.brand('@repo/spec-api/server/MediaType/type')
    ),
  }),
}) {}

export type MediaTypesTable = TableFromModel<typeof MediaType>;

export class MediaItem extends Model.Class<MediaItem>('@repo/spec-api/server/MediaItem')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/MediaItem/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/MediaItem/id')),
  }),
  type: Model.Field({ select: MediaType.fields.type, json: MediaType.fields.type }),
  ...Timestamped.fullFields,
}) {}

export type MediaItemTable = TableFromModel<typeof MediaItem>;

export class Audiobook extends Model.Class<Audiobook>('@repo/spec-api/server/Audiobook')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/Audiobook/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/Audiobook/id')),
  }),
  asin: Model.Field({
    select: Schema.NullOr(Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/asin'))),
    json: Schema.NullOr(Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/asin'))),
  }),
  mediaItemId: Model.Field({
    select: MediaItem.fields.id,
    json: MediaItem.fields.id,
  }),
  title: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/title')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/title')),
  }),
  subtitle: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/subtitle'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/subtitle'))
    ),
  }),
  cover: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/cover'))
    ),
    json: Schema.NullOr(Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/cover'))),
  }),
  coverThumbhash: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/coverThumbhash'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/coverThumbhash'))
    ),
  }),
  summary: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/Audiobook/summary'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookTable = TableFromModel<typeof Audiobook>;

export class AudiobookSeries extends Model.Class<AudiobookSeries>(
  '@repo/spec-api/server/AudiobookSeries'
)({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/id')),
  }),
  asin: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/asin')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/asin')),
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/name')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/name')),
  }),
  summary: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeries/summary'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookSeriesTable = TableFromModel<typeof AudiobookSeries>;

export class AudiobookSeriesMap extends Model.Class<AudiobookSeriesMap>(
  '@repo/spec-api/server/AudiobookSeriesMap'
)({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/id')),
  }),
  audiobookId: Model.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookSeriesId: Model.Field({
    select: Schema.NullOr(AudiobookSeries.fields.id),
    json: Schema.NullOr(AudiobookSeries.fields.id),
  }),
  title: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/title')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/title')),
  }),
  label: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/label')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/label')),
  }),
  sort: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/sort')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookSeriesMap/sort')),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookSeriesMapTable = TableFromModel<typeof AudiobookSeriesMap>;

export class AudiobookContributor extends Model.Class<AudiobookContributor>(
  '@repo/spec-api/server/AudiobookContributor'
)({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/id')),
  }),
  asin: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/asin')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/asin')),
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/name')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/name')),
  }),
  about: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/about'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/about'))
    ),
  }),
  avatar: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/avatar'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/avatar'))
    ),
  }),
  avatarThumbhash: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/avatarThumbhash'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributor/avatarThumbhash'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookContributorTable = TableFromModel<typeof AudiobookContributor>;

export class AudiobookContributorRole extends Model.Class<AudiobookContributorRole>(
  '@repo/spec-api/server/AudiobookContributorRole'
)({
  role: Model.Field({
    select: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/server/AudiobookContributorRole/role')
    ),
    json: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/server/AudiobookContributorRole/role')
    ),
  }),
}) {}

export type AudiobookContributorRoleTable = TableFromModel<typeof AudiobookContributorRole>;

export class AudiobookContributorMap extends Model.Class<AudiobookContributorMap>(
  '@repo/spec-api/server/AudiobookContributorMap'
)({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributorMap/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributorMap/id')),
  }),
  audiobookId: Model.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookContributorId: Model.Field({
    select: Schema.NullOr(AudiobookContributor.fields.id),
    json: Schema.NullOr(AudiobookContributor.fields.id),
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributorMap/name')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/AudiobookContributorMap/name')),
  }),
  role: Model.Field({
    select: AudiobookContributorRole.fields.role,
    json: AudiobookContributorRole.fields.role,
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookContributorMapTable = TableFromModel<typeof AudiobookContributorMap>;

export class Library extends Model.Class<Library>('@repo/spec-api/server/Library')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/Library/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/Library/id')),
    jsonUpdate: Schema.Option(Schema.Int.pipe(Schema.brand('@repo/spec-api/server/Library/id'))),
  }),
  type: Model.Field({
    select: MediaType.fields.type,
    insert: MediaType.fields.type,
    update: MediaType.fields.type,
    json: MediaType.fields.type,
    jsonUpdate: MediaType.fields.type,
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/Library/name')),
    insert: Schema.String,
    update: Schema.String,
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/Library/name')),
    jsonUpdate: Schema.String,
  }),
  ...Timestamped.fullFields,
}) {}

export type LibraryTable = TableFromModel<typeof Library>;

export class LibraryPath extends Model.Class<LibraryPath>('@repo/spec-api/server/LibraryPath')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/LibraryPath/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/LibraryPath/id')),
  }),
  libraryId: Model.Field({
    select: Library.fields.id,
    insert: Library.fields.id,
    json: Library.fields.id,
  }),
  absolutePath: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/LibraryPath/absolutePath')),
    insert: Schema.String,
    update: Schema.String,
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/LibraryPath/absolutePath')),
    jsonUpdate: Schema.String,
  }),
  ...Timestamped.fullFields,
}) {}

export type LibraryPathTable = TableFromModel<typeof LibraryPath>;

export class MediaFile extends Model.Class<MediaFile>('@repo/spec-api/server/MediaFile')({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/MediaFile/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/MediaFile/id')),
  }),
  absolutePath: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/MediaFile/absolutePath')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/MediaFile/absolutePath')),
  }),
  durationMs: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/MediaFile/durationMs')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/MediaFile/durationMs')),
  }),
  ...Timestamped.fullFields,
}) {}

export type MediaFileTable = TableFromModel<typeof MediaFile>;

export class LibraryFileMap extends Model.Class<LibraryFileMap>(
  '@repo/spec-api/server/LibraryFileMap'
)({
  id: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/id')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/id')),
  }),
  libraryId: Model.Field({ select: Library.fields.id, json: Library.fields.id }),
  mediaFileId: Model.Field({ select: MediaFile.fields.id, json: MediaFile.fields.id }),
  mediaItemId: Model.Field({
    select: Schema.NullOr(MediaItem.fields.id),
    json: Schema.NullOr(MediaItem.fields.id),
  }),
  matchFailureReason: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/matchFailureReason'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/matchFailureReason'))
    ),
  }),
  variant: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/variant')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/variant')),
  }),
  customOrder: Model.Field({
    select: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/customOrder')),
    json: Schema.Int.pipe(Schema.brand('@repo/spec-api/server/LibraryFileMap/customOrder')),
  }),
  ...Timestamped.fullFields,
}) {}

export type LibraryFileMapTable = TableFromModel<typeof LibraryFileMap>;

export interface DatabaseTables {
  mediaType: MediaTypesTable;
  mediaItem: MediaItemTable;
  audiobook: AudiobookTable;
  audiobookSeries: AudiobookSeriesTable;
  audiobookSeriesMap: AudiobookSeriesMapTable;
  audiobookContributor: AudiobookContributorTable;
  audiobookContributorRole: AudiobookContributorRoleTable;
  audiobookContributorMap: AudiobookContributorMapTable;
  library: LibraryTable;
  libraryPath: LibraryPathTable;
  mediaFile: MediaFileTable;
  libraryFileMap: LibraryFileMapTable;
}
