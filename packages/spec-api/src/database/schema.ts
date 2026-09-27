import { Schema } from 'effect';
import { Model, VariantSchema } from 'effect/unstable/schema';

import {
  StorageMediaFileLocation,
  StorageRootLocation,
  StorageRootLocationFromString,
} from '#src/storage.ts';

const DbModel = VariantSchema.make({
  variants: [
    'select',
    'insert',
    'update',
    'upsert',
    'json',
    'jsonCreate',
    'jsonUpdate',
    'jsonUpsert',
  ],
  defaultVariant: 'select',
});

class Timestamped extends DbModel.Class<Timestamped>('@repo/spec-api/database/schema/Timestamped')({
  createdAt: Model.GeneratedByDb(Schema.DateTimeUtcFromMillis),
  updatedAt: Model.GeneratedByDb(Schema.DateTimeUtcFromMillis),
  deletedAt: DbModel.Field({
    select: Schema.NullOr(Schema.DateTimeUtcFromMillis),
    json: Schema.NullOr(Schema.DateTimeUtcFromMillis),
  }),
}) {
  public static readonly fullFields = Model.fields(this);
}

export class MediaType extends DbModel.Class<MediaType>('@repo/spec-api/database/schema/MediaType')(
  {
    type: DbModel.Field({
      select: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
        Schema.brand('@repo/spec-api/database/schema/MediaType/type')
      ),
      json: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
        Schema.brand('@repo/spec-api/database/schema/MediaType/type')
      ),
    }),
  }
) {}

export class MediaItem extends DbModel.Class<MediaItem>('@repo/spec-api/database/schema/MediaItem')(
  {
    id: DbModel.Field({
      select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaItem/id')),
      json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaItem/id')),
    }),
    type: DbModel.Field({ select: MediaType.fields.type, json: MediaType.fields.type }),
    ...Timestamped.fullFields,
  }
) {}

export class Audiobook extends DbModel.Class<Audiobook>('@repo/spec-api/database/schema/Audiobook')(
  {
    id: DbModel.Field({
      select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/id')),
      json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/id')),
    }),
    asin: DbModel.Field({
      select: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/asin'))
      ),
      json: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/asin'))
      ),
    }),
    mediaItemId: DbModel.Field({
      select: MediaItem.fields.id,
      json: MediaItem.fields.id,
    }),
    title: DbModel.Field({
      select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/title')),
      json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/title')),
    }),
    subtitle: DbModel.Field({
      select: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/subtitle'))
      ),
      json: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/subtitle'))
      ),
    }),
    cover: DbModel.Field({
      select: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/cover'))
      ),
      json: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/cover'))
      ),
    }),
    coverThumbhash: DbModel.Field({
      select: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/coverThumbhash'))
      ),
      json: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/coverThumbhash'))
      ),
    }),
    summary: DbModel.Field({
      select: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/summary'))
      ),
      json: Schema.NullOr(
        Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Audiobook/summary'))
      ),
    }),
    ...Timestamped.fullFields,
  }
) {}

export class AudiobookSeries extends DbModel.Class<AudiobookSeries>(
  '@repo/spec-api/database/schema/AudiobookSeries'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/id')),
  }),
  asin: DbModel.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/asin')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/asin')),
  }),
  name: DbModel.Field({
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/name')),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/name')),
  }),
  summary: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/summary'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeries/summary'))
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class AudiobookSeriesMap extends DbModel.Class<AudiobookSeriesMap>(
  '@repo/spec-api/database/schema/AudiobookSeriesMap'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/id')
    ),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/id')),
  }),
  audiobookId: DbModel.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookSeriesId: DbModel.Field({
    select: Schema.NullOr(AudiobookSeries.fields.id),
    json: Schema.NullOr(AudiobookSeries.fields.id),
  }),
  title: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/title')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/title')
    ),
  }),
  label: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/label')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/label')
    ),
  }),
  sort: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/sort')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookSeriesMap/sort')
    ),
  }),
  ...Timestamped.fullFields,
}) {}

export class AudiobookContributor extends DbModel.Class<AudiobookContributor>(
  '@repo/spec-api/database/schema/AudiobookContributor'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/id')
    ),
  }),
  asin: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/asin')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/asin')
    ),
  }),
  name: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/name')
    ),
  }),
  about: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/about'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/about'))
    ),
  }),
  avatar: DbModel.Field({
    select: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/avatar'))
    ),
    json: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/AudiobookContributor/avatar'))
    ),
  }),
  avatarThumbhash: DbModel.Field({
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

export class AudiobookContributorRole extends DbModel.Class<AudiobookContributorRole>(
  '@repo/spec-api/database/schema/AudiobookContributorRole'
)({
  role: DbModel.Field({
    select: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorRole/role')
    ),
    json: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorRole/role')
    ),
  }),
}) {}

export class AudiobookContributorMap extends DbModel.Class<AudiobookContributorMap>(
  '@repo/spec-api/database/schema/AudiobookContributorMap'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/id')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/id')
    ),
  }),
  audiobookId: DbModel.Field({ select: Audiobook.fields.id, json: Audiobook.fields.id }),
  audiobookContributorId: DbModel.Field({
    select: Schema.NullOr(AudiobookContributor.fields.id),
    json: Schema.NullOr(AudiobookContributor.fields.id),
  }),
  name: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/name')
    ),
    json: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/AudiobookContributorMap/name')
    ),
  }),
  role: DbModel.Field({
    select: AudiobookContributorRole.fields.role,
    json: AudiobookContributorRole.fields.role,
  }),
  ...Timestamped.fullFields,
}) {}

const LibraryName = Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Library/name'));

export class Library extends DbModel.Class<Library>('@repo/spec-api/database/schema/Library')({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id')),
    upsert: Schema.Option(
      Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id'))
    ),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id')),
    jsonUpsert: Schema.Option(
      Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/Library/id'))
    ),
  }),
  type: DbModel.Field({
    select: MediaType.fields.type,
    upsert: MediaType.fields.type,
    json: MediaType.fields.type,
    jsonUpsert: MediaType.fields.type,
  }),
  name: DbModel.Field({
    select: LibraryName,
    upsert: LibraryName,
    json: LibraryName,
    jsonUpsert: LibraryName,
  }),
  ...Timestamped.fullFields,
}) {}

export class LibraryRoot extends DbModel.Class<LibraryRoot>(
  '@repo/spec-api/database/schema/LibraryRoot'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryRoot/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryRoot/id')),
  }),
  libraryId: DbModel.Field({
    select: Library.fields.id,
    upsert: Library.fields.id,
    json: Library.fields.id,
  }),
  location: DbModel.Field({
    select: StorageRootLocation,
    upsert: StorageRootLocationFromString,
    json: StorageRootLocation,
    jsonUpsert: StorageRootLocationFromString,
  }),
  ...Timestamped.fullFields,
}) {}

export class MediaFile extends DbModel.Class<MediaFile>('@repo/spec-api/database/schema/MediaFile')(
  {
    id: DbModel.Field({
      select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/id')),
      json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/id')),
    }),
    location: DbModel.Field({
      select: StorageMediaFileLocation,
      json: StorageMediaFileLocation,
    }),
    durationMs: DbModel.Field({
      select: Schema.Natural.pipe(
        Schema.brand('@repo/spec-api/database/schema/MediaFile/durationMs')
      ),
      json: Schema.Natural.pipe(
        Schema.brand('@repo/spec-api/database/schema/MediaFile/durationMs')
      ),
    }),
    ...Timestamped.fullFields,
  }
) {}

export class LibraryFileMap extends DbModel.Class<LibraryFileMap>(
  '@repo/spec-api/database/schema/LibraryFileMap'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/id')),
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
        Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/matchFailureReason')
      )
    ),
    json: Schema.NullOr(
      Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/matchFailureReason')
      )
    ),
  }),
  variant: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/variant')
    ),
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/variant')),
  }),
  customOrder: DbModel.Field({
    select: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/customOrder')
    ),
    json: Schema.Natural.pipe(
      Schema.brand('@repo/spec-api/database/schema/LibraryFileMap/customOrder')
    ),
  }),
  ...Timestamped.fullFields,
}) {}
