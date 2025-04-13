import type { ColumnType } from 'kysely';

type Regularize<
  T extends ColumnType<any, any, any>,
  Version extends 'realtime' | 'regular' = 'regular',
> = Version extends 'realtime' ? T : ColumnType<T['__select__'], never, never>;

export interface LibraryTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  name: Regularize<ColumnType<string, string, string>, Version>;
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
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
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

export interface BookTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  asin: Regularize<ColumnType<string, string, string>, Version>;
  type: Regularize<ColumnType<'audio' | 'ebook', 'audio' | 'ebook', 'audio' | 'ebook'>, Version>;
  otherTypeId: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
  title: Regularize<ColumnType<string, string, string>, Version>;
  subtitle: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  cover: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  summary: Regularize<ColumnType<string | null, string | null, string | null>, Version>;
  adultsOnly: Regularize<ColumnType<0 | 1, 0 | 1, 0 | 1>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
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

export interface AudiobookChapterTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  parentId: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
  source: Regularize<
    ColumnType<'file' | 'audible', 'file' | 'audible', 'file' | 'audible'>,
    Version
  >;
  title: Regularize<ColumnType<string, string, string>, Version>;
  duration: Regularize<ColumnType<number, number, number>, Version>;
  startOffset: Regularize<ColumnType<number, number, number>, Version>;
  createdAt: Regularize<ColumnType<number, number, number>, Version>;
  updatedAt: Regularize<ColumnType<number, number, number>, Version>;
  deletedAt: Regularize<ColumnType<number | null, number | null, number | null>, Version>;
}

export interface AudiobookFileTable<Version extends 'realtime' | 'regular' = 'regular'> {
  id: Regularize<ColumnType<number, number, never>, Version>;
  libraryId: Regularize<ColumnType<number, number, number>, Version>;
  bookId: Regularize<ColumnType<number, number, number>, Version>;
  path: Regularize<ColumnType<string, string, string>, Version>;
  duration: Regularize<ColumnType<number, number, number>, Version>;
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

export interface InstanceDatabase<Version extends 'realtime' | 'regular' = 'regular'> {
  library: LibraryTable<Version>;
  author: AuthorTable<Version>;
  series: SeriesTable<Version>;
  book: BookTable<Version>;
  bookAuthor: BookAuthorTable<Version>;
  bookSeries: BookSeriesTable<Version>;
  bookContributor: BookContributorTable<Version>;
  audiobookChapter: AudiobookChapterTable<Version>;
  audiobookFile: AudiobookFileTable<Version>;
  ebookFile: EBookFileTable<Version>;
}
