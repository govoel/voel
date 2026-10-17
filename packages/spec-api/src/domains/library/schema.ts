import { Library as PluginLibrary, MediaType as PluginMediaType } from '@govoel/plugins/library';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePluginConstructionError,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';
import { Model, VariantSchema } from 'effect/schema';

import { PluginLoadError } from '#src/domains/plugins/schema.ts';
import { StoragePluginId, StoragePluginLoadError } from '#src/domains/plugins/storage.ts';

const DbModel = VariantSchema.make({
  variants: ['select', 'create', 'upsert', 'json', 'jsonCreate', 'jsonUpdate', 'jsonUpsert'],
  defaultVariant: 'select',
});

class Timestamped extends DbModel.Class<Timestamped>(
  '@repo/spec-api/domains/library/schema/Timestamped'
)({
  createdAt: Model.GeneratedByDb(Schema.DateTimeUtcFromMillis),
  updatedAt: Model.GeneratedByDb(Schema.DateTimeUtcFromMillis),
  deletedAt: DbModel.Field({
    select: Schema.NullOr(Schema.DateTimeUtcFromMillis),
    json: Schema.NullOr(Schema.DateTimeUtcFromMillis),
  }),
}) {
  public static readonly fullFields = Model.fields(this);
}

export class MediaType extends DbModel.Class<MediaType>(
  '@repo/spec-api/domains/library/schema/MediaType'
)({
  type: DbModel.Field({
    select: PluginMediaType,
    json: PluginMediaType,
  }),
}) {}

export class MediaItem extends DbModel.Class<MediaItem>(
  '@repo/spec-api/domains/library/schema/MediaItem'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/MediaItem/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/MediaItem/id')),
  }),
  type: DbModel.Field({ select: MediaType.fields.type, json: MediaType.fields.type }),
  ...Timestamped.fullFields,
}) {}

export class Audiobook extends DbModel.Class<Audiobook>(
  '@repo/spec-api/domains/library/schema/Audiobook'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/id')),
  }),
  asin: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/asin'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/asin'))
    ),
  }),
  mediaItemId: DbModel.Field({
    select: MediaItem.fields.id,
    json: MediaItem.fields.id,
  }),
  title: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/title')
    ),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/title')),
  }),
  subtitle: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/subtitle'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/subtitle'))
    ),
  }),
  cover: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/cover'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/cover'))
    ),
  }),
  coverThumbhash: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/coverThumbhash')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/coverThumbhash')
      )
    ),
  }),
  summary: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/domains/library/schema/Audiobook/summary'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class AudiobookSeries extends DbModel.Class<AudiobookSeries>(
  '@repo/spec-api/domains/library/schema/AudiobookSeries'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/id')
    ),
  }),
  asin: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/asin')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/asin')
    ),
  }),
  name: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/name')
    ),
  }),
  summary: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/summary')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeries/summary')
      )
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class AudiobookSeriesMap extends DbModel.Class<AudiobookSeriesMap>(
  '@repo/spec-api/domains/library/schema/AudiobookSeriesMap'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/id')
    ),
  }),
  audiobookId: DbModel.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookSeriesId: DbModel.Field({
    select: Schema.NullOr(AudiobookSeries.fields.id),
    json: Schema.NullOr(AudiobookSeries.fields.id),
  }),
  title: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/title')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/title')
    ),
  }),
  label: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/label')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/label')
    ),
  }),
  sort: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/sort')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookSeriesMap/sort')
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class AudiobookContributor extends DbModel.Class<AudiobookContributor>(
  '@repo/spec-api/domains/library/schema/AudiobookContributor'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/id')
    ),
  }),
  asin: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/asin')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/asin')
    ),
  }),
  name: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/name')
    ),
  }),
  about: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/about')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/about')
      )
    ),
  }),
  avatar: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/avatar')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/avatar')
      )
    ),
  }),
  avatarThumbhash: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/avatarThumbhash')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributor/avatarThumbhash')
      )
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class AudiobookContributorRole extends DbModel.Class<AudiobookContributorRole>(
  '@repo/spec-api/domains/library/schema/AudiobookContributorRole'
)({
  role: DbModel.Field({
    select: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributorRole/role')
    ),
    json: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributorRole/role')
    ),
  }),
}) {}

export class AudiobookContributorMap extends DbModel.Class<AudiobookContributorMap>(
  '@repo/spec-api/domains/library/schema/AudiobookContributorMap'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributorMap/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributorMap/id')
    ),
  }),
  audiobookId: DbModel.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookContributorId: DbModel.Field({
    select: Schema.NullOr(AudiobookContributor.fields.id),
    json: Schema.NullOr(AudiobookContributor.fields.id),
  }),
  name: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributorMap/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/AudiobookContributorMap/name')
    ),
  }),
  role: DbModel.Field({
    select: AudiobookContributorRole.fields.role,
    json: AudiobookContributorRole.fields.role,
  }),
  ...Timestamped.fullFields,
}) {}

export class Library extends DbModel.Class<Library>(
  '@repo/spec-api/domains/library/schema/Library'
)({
  id: DbModel.Field({
    select: PluginLibrary.fields.id,
    create: PluginLibrary.fields.id,
    json: PluginLibrary.fields.id,
  }),
  type: DbModel.Field({
    select: PluginLibrary.fields.type,
    create: PluginLibrary.fields.type,
    json: PluginLibrary.fields.type,
    jsonCreate: PluginLibrary.fields.type,
  }),
  name: DbModel.Field({
    select: PluginLibrary.fields.name,
    create: PluginLibrary.fields.name,
    json: PluginLibrary.fields.name,
    jsonCreate: PluginLibrary.fields.name,
    jsonUpdate: PluginLibrary.fields.name,
  }),
  storagePlugin: DbModel.Field({
    select: StoragePluginId,
    create: StoragePluginId,
    json: StoragePluginId,
    jsonCreate: StoragePluginId,
  }),
  storagePluginSettings: DbModel.Field({
    select: Schema.OptionFromNullOr(StoragePluginSettingsPersisted.fromJsonString),
    json: Schema.Option(StoragePluginSettingsPersisted),
  }),
  createdAt: Timestamped.fullFields.createdAt,
  updatedAt: Timestamped.fullFields.updatedAt,
}) {}

export class LibraryRoot extends DbModel.Class<LibraryRoot>(
  '@repo/spec-api/domains/library/schema/LibraryRoot'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryRoot/id')
    ),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/LibraryRoot/id')),
  }),
  libraryId: DbModel.Field({
    select: Library.fields.id,
    upsert: Library.fields.id,
    json: Library.fields.id,
  }),
  root: DbModel.Field({
    select: StorageRootLocation,
    upsert: StorageRootLocation,
    json: StorageRootLocation,
    jsonUpsert: Schema.NonEmptyString,
  }),
  createdAt: Timestamped.fullFields.createdAt,
  updatedAt: Timestamped.fullFields.updatedAt,
}) {}

export class MediaFile extends DbModel.Class<MediaFile>(
  '@repo/spec-api/domains/library/schema/MediaFile'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/MediaFile/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/domains/library/schema/MediaFile/id')),
  }),
  location: DbModel.Field({
    select: StorageMediaFileLocation,
    json: StorageMediaFileLocation,
  }),
  durationMs: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/MediaFile/durationMs')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/MediaFile/durationMs')
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class LibraryFileMap extends DbModel.Class<LibraryFileMap>(
  '@repo/spec-api/domains/library/schema/LibraryFileMap'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/id')
    ),
  }),
  libraryId: DbModel.Field({ select: Library.fields.id, json: Library.fields.id }),
  mediaFileId: DbModel.Field({ select: MediaFile.fields.id, json: MediaFile.fields.id }),
  mediaItemId: DbModel.Field({
    select: Schema.NullOr(MediaItem.fields.id),
    json: Schema.NullOr(MediaItem.fields.id),
  }),
  matchFailureReason: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/matchFailureReason')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/matchFailureReason')
      )
    ),
  }),
  variant: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/variant')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/variant')
    ),
  }),
  customOrder: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/customOrder')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/domains/library/schema/LibraryFileMap/customOrder')
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class LibraryNotFoundError extends Schema.TaggedError<
  LibraryNotFoundError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/schema/LibraryNotFoundError')('LibraryNotFoundError', {
  id: Library.fields.id,
}) {}

export class LibraryNameConflictError extends Schema.TaggedError<
  LibraryNameConflictError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/schema/LibraryNameConflictError')('LibraryNameConflictError', {
  libraryName: Library.fields.name,
}) {}

export class LibraryUnconfiguredError extends Schema.TaggedError<
  LibraryUnconfiguredError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/schema/LibraryUnconfiguredError')('LibraryUnconfiguredError', {
  id: Library.fields.id,
}) {}

export class LibraryInvalidRootError extends Schema.TaggedError<
  LibraryInvalidRootError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/schema/LibraryInvalidRootError')('LibraryInvalidRootError', {
  roots: Schema.NonEmptyArray(
    Schema.Struct({
      // Rejected submissions are raw strings, not validated storage locations.
      root: Schema.String,
      message: StorageLocationValidationError.fields.message,
    })
  ),
}) {}

/** Cached construction state of storage and its settings editor, not a live health probe. */
export const StoragePluginStatus = Schema.Literals(['unknown', 'healthy', 'unhealthy']);

/** Any cached failure wins; healthy means at least one current component was built successfully. */
export const StoragePluginHealth = Schema.Union([
  Schema.Struct({ status: Schema.Literal('unknown') }),
  Schema.Struct({ status: Schema.Literal('healthy') }),
  Schema.Struct({
    status: Schema.Literal('unhealthy'),
    errors: Schema.NonEmptyArray(
      Schema.Union([
        PluginLoadError,
        StoragePluginLoadError,
        StoragePluginConstructionError,
        StoragePluginSettingsConstructionError,
      ])
    ),
  }),
]);
