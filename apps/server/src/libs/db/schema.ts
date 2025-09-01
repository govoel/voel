import type { ColumnType } from 'kysely';

export interface LibraryTable {
  id: ColumnType<number, never, never>;
  name: string;
  path: ColumnType<string, string, never>;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface ContributorTable {
  id: ColumnType<number, never, never>;
  asin: string;
  name: string;
  about: string | null;
  avatar: string | null;
  avatarThumbhash: string | null;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface SeriesTable {
  id: ColumnType<number, never, never>;
  asin: string;
  name: string;
  summary: string | null;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface BookTable {
  id: ColumnType<number, never, never>;
  asin: string;
  type: 'audio' | 'ebook';
  otherTypeId: number | null;
  title: string;
  subtitle: string | null;
  cover: string | null;
  coverThumbhash: string | null;
  summary: string | null;
  adultsOnly: 0 | 1;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface BookSeriesTable {
  id: ColumnType<number, never, never>;
  bookId: number;
  seriesId: number | null;
  // when seriesId is non-null, title must be the same as series.name
  title: string;
  label: string;
  sort: number;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface BookContributorTable {
  id: ColumnType<number, never, never>;
  bookId: number;
  contributorId: number | null;
  // when contributorId is non-null, name must be the same as contributor.name
  name: string;
  role: 'author' | 'narrator' | 'editor' | 'translator' | 'foreword';
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export type AudiobookChapterTable = {
  id: ColumnType<number, never, never>;
  bookId: number;
  title: string;
  durationMs: number;
  startOffsetMs: number; // when source is 'file', start time is relative to the beginning of the file, absolute otherwise
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
} & (
  | {
      source: 'file';
      parentId: null;
      fileId: number;
    }
  | {
      source: 'audible';
      parentId: number | null;
      fileId: null;
    }
);

export interface AudiobookFileTable {
  id: ColumnType<number, never, never>;
  libraryId: number;
  bookId: number;
  path: string;
  mtimeMs: number;
  metadataHash: string;
  durationMs: number;
  disc: number;
  track: number;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface UnidentifiedAudiobookFileTable {
  id: ColumnType<number, never, never>;
  libraryId: number;
  path: string;
  durationMs: number;
  disc: number;
  track: number;
  reason:
    | 'METADATA_NO_ALBUM_TITLE'
    | 'METADATA_NO_ARTIST_NAME'
    | 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME'
    | 'AUDIBLE_COULD_NOT_ID_BOOK';
  metadata: string;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number | null>;
}

export interface EBookFileTable {
  id: ColumnType<number, never, never>;
  libraryId: number;
  bookId: number;
  path: string;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface PlaybackHistoryTable {
  id: ColumnType<number, never, never>;
  userId: ColumnType<string, string, never>;
  type: ColumnType<number, number, never>;
  bookId: ColumnType<number, number, never>;
  positionMs: ColumnType<number, number, never>;
  eventTimestampMs: ColumnType<number, number, never>;
  sessionId: ColumnType<string, string, never>;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface SQLiteSequenceTable {
  name: ColumnType<string, never, never>;
  seq: ColumnType<number, never, never>;
}

export interface DatabaseSchema {
  library: LibraryTable;
  contributor: ContributorTable;
  series: SeriesTable;
  book: BookTable;
  bookSeries: BookSeriesTable;
  bookContributor: BookContributorTable;
  audiobookChapter: AudiobookChapterTable;
  audiobookFile: AudiobookFileTable;
  unidentifiedAudiobookFile: UnidentifiedAudiobookFileTable;
  ebookFile: EBookFileTable;
  playbackHistory: PlaybackHistoryTable;
  sqlite_sequence: SQLiteSequenceTable;
}
