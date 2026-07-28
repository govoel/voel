import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';

import type { TableFromModel } from '@repo/effect-kysely';

class Timestamped extends Model.Class<Timestamped>('@repo/spec-api/database/schema/Timestamped')({
  createdAt: Model.Field({
    select: Schema.Natural,
    json: Schema.Natural,
  }),
  updatedAt: Model.Field({
    select: Schema.Natural,
    json: Schema.Natural,
  }),
  deletedAt: Model.Field({
    select: Schema.NullOr(Schema.Natural),
    update: Schema.NullOr(Schema.Natural),
    json: Schema.NullOr(Schema.Natural),
  }),
}) {
  public static readonly fullFields = Model.fields(this);
}

export class MediaType extends Model.Class<MediaType>('@repo/spec-api/database/schema/MediaType')({
  type: Model.Field({
    select: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
      Schema.brand('@repo/spec-api/database/schema/MediaType/type')
    ),
    json: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
      Schema.brand('@repo/spec-api/database/schema/MediaType/type')
    ),
  }),
}) {}

export type MediaTypesTable = TableFromModel<typeof MediaType>;

export class MediaItem extends Model.Class<MediaItem>('@repo/spec-api/database/schema/MediaItem')({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaItem/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaItem/id')),
  }),
  type: Model.Field({ select: MediaType.fields.type, json: MediaType.fields.type }),
  ...Timestamped.fullFields,
}) {}

export type MediaItemTable = TableFromModel<typeof MediaItem>;

export class Audiobook extends Model.Class<Audiobook>('@repo/spec-api/database/schema/Audiobook')({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/id')),
  }),
  asin: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/asin'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/asin'))
    ),
  }),
  mediaItemId: Model.Field({
    select: MediaItem.fields.id,
    json: MediaItem.fields.id,
  }),
  title: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/title')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/title')),
  }),
  subtitle: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/subtitle'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/subtitle'))
    ),
  }),
  cover: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/cover'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/cover'))
    ),
  }),
  coverThumbhash: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/coverThumbhash'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/coverThumbhash'))
    ),
  }),
  summary: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/summary'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookTable = TableFromModel<typeof Audiobook>;

export class AudiobookSeries extends Model.Class<AudiobookSeries>(
  '@repo/spec-api/database/schema/AudiobookSeries'
)({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/id')),
  }),
  asin: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/asin')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/asin')),
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/name')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/name')),
  }),
  summary: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/summary'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookSeriesTable = TableFromModel<typeof AudiobookSeries>;

export class AudiobookSeriesMap extends Model.Class<AudiobookSeriesMap>(
  '@repo/spec-api/database/schema/AudiobookSeriesMap'
)({
  id: Model.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/id')
    ),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/id')),
  }),
  audiobookId: Model.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookSeriesId: Model.Field({
    select: Schema.NullOr(AudiobookSeries.fields.id),
    json: Schema.NullOr(AudiobookSeries.fields.id),
  }),
  title: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/title')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/title')
    ),
  }),
  label: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/label')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/label')
    ),
  }),
  sort: Model.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/sort')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/sort')
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookSeriesMapTable = TableFromModel<typeof AudiobookSeriesMap>;

export class AudiobookContributor extends Model.Class<AudiobookContributor>(
  '@repo/spec-api/database/schema/AudiobookContributor'
)({
  id: Model.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/id')
    ),
  }),
  asin: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/asin')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/asin')
    ),
  }),
  name: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/name')
    ),
  }),
  about: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/about'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/about'))
    ),
  }),
  avatar: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/avatar'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/avatar'))
    ),
  }),
  avatarThumbhash: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/avatarThumbhash')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/avatarThumbhash')
      )
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookContributorTable = TableFromModel<typeof AudiobookContributor>;

export class AudiobookContributorRole extends Model.Class<AudiobookContributorRole>(
  '@repo/spec-api/database/schema/AudiobookContributorRole'
)({
  role: Model.Field({
    select: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorRole/role')
    ),
    json: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorRole/role')
    ),
  }),
}) {}

export type AudiobookContributorRoleTable = TableFromModel<typeof AudiobookContributorRole>;

export class AudiobookContributorMap extends Model.Class<AudiobookContributorMap>(
  '@repo/spec-api/database/schema/AudiobookContributorMap'
)({
  id: Model.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/id')
    ),
  }),
  audiobookId: Model.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookContributorId: Model.Field({
    select: Schema.NullOr(AudiobookContributor.fields.id),
    json: Schema.NullOr(AudiobookContributor.fields.id),
  }),
  name: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/name')
    ),
  }),
  role: Model.Field({
    select: AudiobookContributorRole.fields.role,
    json: AudiobookContributorRole.fields.role,
  }),
  ...Timestamped.fullFields,
}) {}

export type AudiobookContributorMapTable = TableFromModel<typeof AudiobookContributorMap>;

export class Library extends Model.Class<Library>('@repo/spec-api/database/schema/Library')({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id')),
    jsonUpdate: Schema.Option(
      Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id'))
    ),
  }),
  type: Model.Field({
    select: MediaType.fields.type,
    insert: MediaType.fields.type,
    update: MediaType.fields.type,
    json: MediaType.fields.type,
    jsonUpdate: MediaType.fields.type,
  }),
  name: Model.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Library/name')),
    insert: Schema.String,
    update: Schema.String,
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Library/name')),
    jsonUpdate: Schema.String,
  }),
  ...Timestamped.fullFields,
}) {}

export type LibraryTable = TableFromModel<typeof Library>;

export class LibraryPath extends Model.Class<LibraryPath>(
  '@repo/spec-api/database/schema/LibraryPath'
)({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryPath/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryPath/id')),
  }),
  libraryId: Model.Field({
    select: Library.fields.id,
    insert: Library.fields.id,
    json: Library.fields.id,
  }),
  absolutePath: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryPath/absolutePath')
    ),
    insert: Schema.String,
    update: Schema.String,
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryPath/absolutePath')
    ),
    jsonUpdate: Schema.String,
  }),
  ...Timestamped.fullFields,
}) {}

export type LibraryPathTable = TableFromModel<typeof LibraryPath>;

export class MediaFile extends Model.Class<MediaFile>('@repo/spec-api/database/schema/MediaFile')({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/id')),
  }),
  absolutePath: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/MediaFile/absolutePath')
    ),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/absolutePath')),
  }),
  durationMs: Model.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/MediaFile/durationMs')
    ),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/durationMs')),
  }),
  ...Timestamped.fullFields,
}) {}

export type MediaFileTable = TableFromModel<typeof MediaFile>;

export class LibraryFileMap extends Model.Class<LibraryFileMap>(
  '@repo/spec-api/database/schema/LibraryFileMap'
)({
  id: Model.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/id')),
  }),
  libraryId: Model.Field({ select: Library.fields.id, json: Library.fields.id }),
  mediaFileId: Model.Field({ select: MediaFile.fields.id, json: MediaFile.fields.id }),
  mediaItemId: Model.Field({
    select: Schema.NullOr(MediaItem.fields.id),
    json: Schema.NullOr(MediaItem.fields.id),
  }),
  matchFailureReason: Model.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/matchFailureReason')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/matchFailureReason')
      )
    ),
  }),
  variant: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/variant')
    ),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/variant')),
  }),
  customOrder: Model.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/customOrder')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/customOrder')
    ),
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
