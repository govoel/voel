import type { ColumnType } from 'kysely';

export interface LibraryTable {
  id: ColumnType<number, never, never>;
  name: string;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface AuthorTable {
  id: ColumnType<number, never, never>;
  asin: string;
  name: string;
  about: string | null;
  avatar: string | null;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface SeriesTable {
  id: ColumnType<number, never, never>;
  asin: string;
  name: string;
  summary: string | null;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface BookTable {
  id: ColumnType<number, never, never>;
  asin: string;
  type: 'audio' | 'ebook';
  otherTypeId: number | null;
  title: string;
  subtitle: string | null;
  cover: string | null;
  summary: string | null;
  adultsOnly: 0 | 1;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface BookAuthorTable {
  bookId: number;
  authorId: number;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface BookSeriesTable {
  bookId: number;
  seriesId: number;
  label: string;
  sort: number;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface BookContributorTable {
  bookId: number;
  name: string;
  role: 'narrator' | 'editor' | 'illustrator' | 'translator';
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface AudiobookChapterTable {
  id: ColumnType<number, never, never>;
  bookId: number;
  parentId: number | null;
  source: 'file' | 'audible';
  title: string;
  duration: number;
  startOffset: number;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface AudiobookFileTable {
  id: ColumnType<number, never, never>;
  libraryId: number;
  bookId: number;
  path: string;
  duration: number;
  disc: number;
  track: number;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
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

export interface SQLiteSequenceTable {
  name: ColumnType<string, never, never>;
  seq: ColumnType<number, never, never>;
}

export interface DatabaseSchema {
  library: LibraryTable;
  author: AuthorTable;
  series: SeriesTable;
  book: BookTable;
  bookAuthor: BookAuthorTable;
  bookSeries: BookSeriesTable;
  bookContributor: BookContributorTable;
  audiobookChapter: AudiobookChapterTable;
  audiobookFile: AudiobookFileTable;
  ebookFile: EBookFileTable;
  sqlite_sequence: SQLiteSequenceTable;
}
