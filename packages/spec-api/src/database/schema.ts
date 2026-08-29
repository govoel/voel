import { Effect, Path, Schema, SchemaGetter, SchemaIssue } from 'effect';
import { Model, VariantSchema } from 'effect/unstable/schema';

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
    select: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Library/name')),
    upsert: Schema.String,
    json: Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/Library/name')),
    jsonUpsert: Schema.String,
  }),
  ...Timestamped.fullFields,
}) {}

const AbsolutePathFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryPath/absolutePath')),
    {
      decode: SchemaGetter.transformOrFail(
        Effect.fnUntraced(function* (absolutePath, options) {
          const path = yield* Path.Path;

          if (!path.isAbsolute(absolutePath)) {
            return yield* Effect.fail(
              new SchemaIssue.InvalidValue(
                { message: 'Expected an absolute path' },
                absolutePath,
                options
              )
            );
          }

          return path.resolve(absolutePath);
        })
      ),
      encode: SchemaGetter.passthrough(),
    }
  )
);

export class LibraryPath extends DbModel.Class<LibraryPath>(
  '@repo/spec-api/database/schema/LibraryPath'
)({
  id: DbModel.Field({
    select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryPath/id')),
    json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/LibraryPath/id')),
  }),
  libraryId: DbModel.Field({
    select: Library.fields.id,
    upsert: Library.fields.id,
    json: Library.fields.id,
  }),
  absolutePath: DbModel.Field({
    select: AbsolutePathFromString,
    upsert: AbsolutePathFromString,
    json: Schema.toType(AbsolutePathFromString),
    jsonUpsert: Schema.toEncoded(AbsolutePathFromString),
  }),
  ...Timestamped.fullFields,
}) {
  public static readonly decodeAbsolutePathEffect = Schema.decodeEffect(AbsolutePathFromString);
}

export class MediaFile extends DbModel.Class<MediaFile>('@repo/spec-api/database/schema/MediaFile')(
  {
    id: DbModel.Field({
      select: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/id')),
      json: Schema.Natural.pipe(Schema.brand('@repo/spec-api/database/schema/MediaFile/id')),
    }),
    absolutePath: DbModel.Field({
      select: Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/MediaFile/absolutePath')
      ),
      json: Schema.String.pipe(
        Schema.brand('@repo/spec-api/database/schema/MediaFile/absolutePath')
      ),
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
