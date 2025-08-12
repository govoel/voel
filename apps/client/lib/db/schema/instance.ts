import type { ColumnType } from 'kysely';

type Regularize<
  T extends ColumnType<any, any, any>,
  Version extends 'realtime' | 'regular' = 'regular',
> = Version extends 'realtime' ? T : ColumnType<T['__select__'], never, never>;

export interface LibraryTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  name: Regularize<ColumnType<string, string, string>, Version>;
  path: Regularize<ColumnType<string, string, never>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface AuthorTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  asin: Regularize<ColumnType<string, string, string>, Version>;
  name: Regularize<ColumnType<string, string, string>, Version>;
  about: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  avatar: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  avatarThumbhash: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface AuthorFTSTable<Version extends 'realtime' | 'regular' = 'regular'> {
  rowid: Regularize<ColumnType<number, never, never>, Version>;
  name: Regularize<ColumnType<string, never, never>, Version>;
  about: Regularize<ColumnType<string, never, never>, Version>;
  rank: Regularize<ColumnType<number, never, never>, Version>;
}

export interface SeriesTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  asin: Regularize<ColumnType<string, string, string>, Version>;
  name: Regularize<ColumnType<string, string, string>, Version>;
  summary: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface SeriesFTSTable<Version extends 'realtime' | 'regular' = 'regular'> {
  rowid: Regularize<ColumnType<number, never, never>, Version>;
  name: Regularize<ColumnType<string, never, never>, Version>;
  summary: Regularize<ColumnType<string, never, never>, Version>;
  rank: Regularize<ColumnType<number, never, never>, Version>;
}

export interface BookTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  asin: Regularize<ColumnType<string, string, string>, Version>;
  type: Regularize<ColumnType<'audio' | 'ebook', 'audio' | 'ebook', 'audio' | 'ebook'>, Version>;
  otherTypeId: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
  title: Regularize<ColumnType<string, string, string>, Version>;
  subtitle: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  cover: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  coverThumbhash: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  summary: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  adultsOnly: Regularize<ColumnType<0 | 1, 0 | 1, 0 | 1>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface BookFTSTable<Version extends 'realtime' | 'regular' = 'regular'> {
  rowid: Regularize<ColumnType<number, never, never>, Version>;
  title: Regularize<ColumnType<string, never, never>, Version>;
  subtitle: Regularize<ColumnType<string, never, never>, Version>;
  summary: Regularize<ColumnType<string, never, never>, Version>;
  rank: Regularize<ColumnType<number, never, never>, Version>;
}

export interface BookAuthorTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  authorId: Regularize<ColumnType<number, number, number>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface BookSeriesTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  seriesId: Regularize<ColumnType<number, number, number>, Version>;
  label: Regularize<ColumnType<string, string, string>, Version>;
  sort: Regularize<ColumnType<number, number, number>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface BookContributorTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  name: Regularize<ColumnType<string, string, string>, Version>;
  role: Regularize<
    ColumnType<
      'narrator' | 'editor' | 'illustrator' | 'translator',
      'narrator' | 'editor' | 'illustrator' | 'translator',
      'narrator' | 'editor' | 'illustrator' | 'translator'
    >,
    Version
  >;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface BookContributorFTSTable<Version extends 'realtime' | 'regular' = 'regular'> {
  rowid: Regularize<ColumnType<number, never, never>, Version>;
  name: Regularize<ColumnType<string, never, never>, Version>;
  role: Regularize<
    ColumnType<'narrator' | 'editor' | 'illustrator' | 'translator', never, never>,
    Version
  >;
  rank: Regularize<ColumnType<number, never, never>, Version>;
}

export type AudiobookChapterTable<Version extends 'realtime' | 'regular' = 'regular'> = {
  id: Regularize<ColumnType<number, number, never>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  title: Regularize<ColumnType<string, string, string>, Version>;
  durationMs: Regularize<ColumnType<number, number, number>, Version>;
  startOffsetMs: Regularize<ColumnType<number, number, number>, Version>; // when source is 'file', start time is relative to the beginning of the file, absolute otherwise
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
} & (
  | {
      parentId: Regularize<ColumnType<null, null, null>, Version>;
      fileId: Regularize<ColumnType<number, number, number>, Version>;
      source: Regularize<ColumnType<'file', 'file', 'file'>, Version>;
    }
  | {
      parentId: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
      fileId: Regularize<ColumnType<null, null, null>, Version>;
      source: Regularize<ColumnType<'audible', 'audible', 'audible'>, Version>;
    }
);

export interface AudiobookFileTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  libraryId: Regularize<ColumnType<number, number, number>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  path: Regularize<ColumnType<string, string, string>, Version>;
  mtimeMs: Regularize<ColumnType<number, number, number>, Version>;
  metadataHash: Regularize<ColumnType<string, string, string>, Version>;
  durationMs: Regularize<ColumnType<number, number, number>, Version>;
  disc: Regularize<ColumnType<number, number, number>, Version>;
  track: Regularize<ColumnType<number, number, number>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface EBookFileTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  libraryId: Regularize<ColumnType<number, number, number>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  path: Regularize<ColumnType<string, string, string>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface PlaybackHistoryTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  userId: Regularize<ColumnType<string, string, string>, Version>;
  type: Regularize<ColumnType<number, number, number>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  positionMs: Regularize<ColumnType<number, number, number>, Version>;
  eventTimestampMs: Regularize<ColumnType<number, number, number>, Version>;
  sessionId: Regularize<ColumnType<string, string, string>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface LatestPlaybackPositionTable<Version extends 'realtime' | 'regular' = 'regular'> {
  bookId: Version extends 'realtime' ? never : ColumnType<number, never, never>;
  playbackHistoryId: Version extends 'realtime' ? never : ColumnType<number, never, never>;
  positionMs: Version extends 'realtime' ? never : ColumnType<number, never, never>;
  type: Version extends 'realtime' ? never : ColumnType<number, never, never>;
  eventTimestampMs: Version extends 'realtime' ? never : ColumnType<number, never, never>;
}

export interface InstanceDatabase<Version extends 'realtime' | 'regular' = 'regular'> {
  library: LibraryTable<Version>;
  author: AuthorTable<Version>;
  authorFTS: AuthorFTSTable<Version>;
  series: SeriesTable<Version>;
  seriesFTS: SeriesFTSTable<Version>;
  book: BookTable<Version>;
  bookFTS: BookFTSTable<Version>;
  bookAuthor: BookAuthorTable<Version>;
  bookSeries: BookSeriesTable<Version>;
  bookContributor: BookContributorTable<Version>;
  bookContributorFTS: BookContributorFTSTable<Version>;
  audiobookChapter: AudiobookChapterTable<Version>;
  audiobookFile: AudiobookFileTable<Version>;
  ebookFile: EBookFileTable<Version>;
  playbackHistory: PlaybackHistoryTable<Version>;
  latestPlaybackPosition: LatestPlaybackPositionTable<Version>;
}
