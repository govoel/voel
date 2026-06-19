import { Schema } from 'effect';

import type { ColumnType } from '@repo/source-tap';

class Timestamped extends Schema.Class<Timestamped>('Timestamped')({
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  deletedAt: Schema.NullOr(Schema.Int),
}) {}

interface TimesampedTable {
  createdAt: ColumnType<Timestamped['createdAt'], never, never>;
  updatedAt: ColumnType<Timestamped['updatedAt'], never, never>;
  deletedAt: ColumnType<Timestamped['deletedAt'], never, Timestamped['deletedAt']>;
}

class MediaType extends Schema.Class<MediaType>('MediaType')({
  type: Schema.Literals(['audiobook', 'movie', 'show']).pipe(
    Schema.brand('@voel/server/MediaType/type')
  ),
}) {}

interface MediaTypeTable {
  type: ColumnType<MediaType['type'], never, never>;
}

class MediaItem extends Timestamped.extend<MediaItem>('MediaItem')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/MediaItem/id')),
  type: MediaType.fields.type,
}) {}

interface MediaItemTable extends TimesampedTable {
  id: ColumnType<MediaItem['id'], never, never>;
  type: ColumnType<MediaType['type'], never, never>;
}

class Audiobook extends Timestamped.extend<Audiobook>('Audiobook')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/Audiobook/id')),
  asin: Schema.NullOr(Schema.String.pipe(Schema.brand('@voel/server/Audiobook/asin'))),
  mediaItemId: MediaItem.fields.id,
  title: Schema.String.pipe(Schema.brand('@voel/server/Audiobook/title')),
  subtitle: Schema.NullOr(Schema.String.pipe(Schema.brand('@voel/server/Audiobook/subtitle'))),
  cover: Schema.NullOr(Schema.String.pipe(Schema.brand('@voel/server/Audiobook/cover'))),
  coverThumbhash: Schema.NullOr(
    Schema.String.pipe(Schema.brand('@voel/server/Audiobook/coverThumbhash'))
  ),
  summary: Schema.NullOr(Schema.String.pipe(Schema.brand('@voel/server/Audiobook/summary'))),
}) {}

interface AudiobookTable extends TimesampedTable {
  id: ColumnType<Audiobook['id'], never, never>;
  asin: ColumnType<Audiobook['asin'], never, never>;
  mediaItemId: ColumnType<Audiobook['mediaItemId'], never, never>;
  title: ColumnType<Audiobook['title'], never, never>;
  subtitle: ColumnType<Audiobook['subtitle'], never, never>;
  cover: ColumnType<Audiobook['cover'], never, never>;
  coverThumbhash: ColumnType<Audiobook['coverThumbhash'], never, never>;
  summary: ColumnType<Audiobook['summary'], never, never>;
}

class AudiobookSeries extends Timestamped.extend<AudiobookSeries>('AudiobookSeries')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/AudiobookSeries/id')),
  asin: Schema.String.pipe(Schema.brand('@voel/server/AudiobookSeries/asin')),
  name: Schema.String.pipe(Schema.brand('@voel/server/AudiobookSeries/name')),
  summary: Schema.NullOr(Schema.String.pipe(Schema.brand('@voel/server/AudiobookSeries/summary'))),
}) {}

interface AudiobookSeriesTable extends TimesampedTable {
  id: ColumnType<AudiobookSeries['id'], never, never>;
  asin: ColumnType<AudiobookSeries['asin'], never, never>;
  name: ColumnType<AudiobookSeries['name'], never, never>;
  summary: ColumnType<AudiobookSeries['summary'], never, never>;
}

class AudiobookSeriesMap extends Timestamped.extend<AudiobookSeriesMap>('AudiobookSeriesMap')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/AudiobookSeriesMap/id')),
  audiobookId: Audiobook.fields.id,
  audiobookSeriesId: Schema.NullOr(AudiobookSeries.fields.id),
  title: Schema.String.pipe(Schema.brand('@voel/server/AudiobookSeriesMap/title')),
  label: Schema.String.pipe(Schema.brand('@voel/server/AudiobookSeriesMap/label')),
  sort: Schema.Int.pipe(Schema.brand('@voel/server/AudiobookSeriesMap/sort')),
}) {}

interface AudiobookSeriesMapTable extends TimesampedTable {
  id: ColumnType<AudiobookSeriesMap['id'], never, never>;
  audiobookId: ColumnType<AudiobookSeriesMap['audiobookId'], never, never>;
  audiobookSeriesId: ColumnType<AudiobookSeriesMap['audiobookSeriesId'], never, never>;
  title: ColumnType<AudiobookSeriesMap['title'], never, never>;
  label: ColumnType<AudiobookSeriesMap['label'], never, never>;
  sort: ColumnType<AudiobookSeriesMap['sort'], never, never>;
}

class AudiobookContributor extends Timestamped.extend<AudiobookContributor>('AudiobookContributor')(
  {
    id: Schema.Int.pipe(Schema.brand('@voel/server/AudiobookContributor/id')),
    asin: Schema.String.pipe(Schema.brand('@voel/server/AudiobookContributor/asin')),
    name: Schema.String.pipe(Schema.brand('@voel/server/AudiobookContributor/name')),
    about: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@voel/server/AudiobookContributor/about'))
    ),
    avatar: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@voel/server/AudiobookContributor/avatar'))
    ),
    avatarThumbhash: Schema.NullOr(
      Schema.String.pipe(Schema.brand('@voel/server/AudiobookContributor/avatarThumbhash'))
    ),
  }
) {}

interface AudiobookContributorTable extends TimesampedTable {
  id: ColumnType<AudiobookContributor['id'], never, never>;
  asin: ColumnType<AudiobookContributor['asin'], never, never>;
  name: ColumnType<AudiobookContributor['name'], never, never>;
  about: ColumnType<AudiobookContributor['about'], never, never>;
  avatar: ColumnType<AudiobookContributor['avatar'], never, never>;
  avatarThumbhash: ColumnType<AudiobookContributor['avatarThumbhash'], never, never>;
}

class AudiobookContributorRole extends Schema.Class<AudiobookContributorRole>(
  'AudiobookContributorRole'
)({
  role: Schema.Literals(['author', 'narrator', 'editor', 'translator', 'foreword']).pipe(
    Schema.brand('@voel/server/AudiobookContributorRole/role')
  ),
}) {}

interface AudiobookContributorRoleTable {
  role: ColumnType<AudiobookContributorRole['role'], never, never>;
}

class AudiobookContributorMap extends Timestamped.extend<AudiobookContributorMap>(
  'AudiobookContributorMap'
)({
  id: Schema.Int.pipe(Schema.brand('@voel/server/AudiobookContributorMap/id')),
  audiobookId: Audiobook.fields.id,
  audiobookContributorId: Schema.NullOr(AudiobookContributor.fields.id),
  name: Schema.String.pipe(Schema.brand('@voel/server/AudiobookContributorMap/name')),
  role: AudiobookContributorRole.fields.role,
}) {}

interface AudiobookContributorMapTable extends TimesampedTable {
  id: ColumnType<AudiobookContributorMap['id'], never, never>;
  audiobookId: ColumnType<AudiobookContributorMap['audiobookId'], never, never>;
  audiobookContributorId: ColumnType<
    AudiobookContributorMap['audiobookContributorId'],
    never,
    never
  >;
  name: ColumnType<AudiobookContributorMap['name'], never, never>;
  role: ColumnType<AudiobookContributorMap['role'], never, never>;
}

class Library extends Timestamped.extend<Library>('Library')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/Library/id')),
  type: MediaType.fields.type,
  name: Schema.String.pipe(Schema.brand('@voel/server/Library/name')),
}) {}

interface LibraryTable extends TimesampedTable {
  id: ColumnType<Library['id'], never, never>;
  type: Library['type'];
  name: ColumnType<
    Library['name'],
    (typeof Library)['fields']['name']['schema']['Type'],
    (typeof Library)['fields']['name']['schema']['Type']
  >;
}

class LibraryPath extends Timestamped.extend<LibraryPath>('LibraryPath')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/LibraryPath/id')),
  libraryId: Library.fields.id,
  absolutePath: Schema.String.pipe(Schema.brand('@voel/server/LibraryPath/absolutePath')),
}) {}

interface LibraryPathTable extends TimesampedTable {
  id: ColumnType<LibraryPath['id'], never, never>;
  libraryId: ColumnType<LibraryPath['libraryId'], never, never>;
  absolutePath: ColumnType<LibraryPath['absolutePath'], never, never>;
}

class MediaFile extends Timestamped.extend<MediaFile>('MediaFile')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/MediaFile/id')),
  absolutePath: Schema.String.pipe(Schema.brand('@voel/server/MediaFile/absolutePath')),
  durationMs: Schema.Int.pipe(Schema.brand('@voel/server/MediaFile/durationMs')),
}) {}

interface MediaFileTable extends TimesampedTable {
  id: ColumnType<MediaFile['id'], never, never>;
  absolutePath: ColumnType<MediaFile['absolutePath'], never, never>;
  durationMs: ColumnType<MediaFile['durationMs'], never, never>;
}

class LibraryFileMap extends Timestamped.extend<LibraryFileMap>('LibraryFileMap')({
  id: Schema.Int.pipe(Schema.brand('@voel/server/LibraryFileMap/id')),
  libraryId: Library.fields.id,
  mediaFileId: MediaFile.fields.id,
  mediaItemId: Schema.NullOr(MediaItem.fields.id),
  matchFailureReason: Schema.NullOr(
    Schema.String.pipe(Schema.brand('@voel/server/LibraryFileMap/matchFailureReason'))
  ),
  variant: Schema.String.pipe(Schema.brand('@voel/server/LibraryFileMap/variant')),
  customOrder: Schema.Int.pipe(Schema.brand('@voel/server/LibraryFileMap/customOrder')),
}) {}

interface LibraryFileMapTable extends TimesampedTable {
  id: ColumnType<LibraryFileMap['id'], never, never>;
  libraryId: ColumnType<LibraryFileMap['libraryId'], never, never>;
  mediaFileId: ColumnType<LibraryFileMap['mediaFileId'], never, never>;
  mediaItemId: ColumnType<LibraryFileMap['mediaItemId'], never, never>;
  matchFailureReason: ColumnType<LibraryFileMap['matchFailureReason'], never, never>;
  variant: ColumnType<LibraryFileMap['variant'], never, never>;
  customOrder: ColumnType<LibraryFileMap['customOrder'], never, never>;
}

export interface DatabaseTables {
  mediaType: MediaTypeTable;
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
