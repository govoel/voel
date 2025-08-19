import type { Insertable, Kysely, Transaction } from 'kysely';

import type {
  AudiobookChapterTable,
  AudiobookFileTable,
  BookContributorTable,
  BookSeriesTable,
  BookTable,
  ContributorTable,
  EBookFileTable,
  InstanceDatabase,
  LibraryTable,
  PlaybackHistoryTable,
  SeriesTable,
} from '~/lib/db/schema/instance';

export const upsertLibrary = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<LibraryTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('library')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        name: (eb) => eb.ref('excluded.name'),
        path: (eb) => eb.ref('excluded.path'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertContributor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<ContributorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('contributor')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        asin: (eb) => eb.ref('excluded.asin'),
        name: (eb) => eb.ref('excluded.name'),
        about: (eb) => eb.ref('excluded.about'),
        avatar: (eb) => eb.ref('excluded.avatar'),
        avatarThumbhash: (eb) => eb.ref('excluded.avatarThumbhash'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertSeries = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<SeriesTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('series')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        asin: (eb) => eb.ref('excluded.asin'),
        name: (eb) => eb.ref('excluded.name'),
        summary: (eb) => eb.ref('excluded.summary'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertBook = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('book')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        asin: (eb) => eb.ref('excluded.asin'),
        type: (eb) => eb.ref('excluded.type'),
        otherTypeId: (eb) => eb.ref('excluded.otherTypeId'),
        title: (eb) => eb.ref('excluded.title'),
        subtitle: (eb) => eb.ref('excluded.subtitle'),
        cover: (eb) => eb.ref('excluded.cover'),
        coverThumbhash: (eb) => eb.ref('excluded.coverThumbhash'),
        summary: (eb) => eb.ref('excluded.summary'),
        adultsOnly: (eb) => eb.ref('excluded.adultsOnly'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertBookSeries = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookSeriesTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('bookSeries')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        seriesId: (eb) => eb.ref('excluded.seriesId'),
        title: (eb) => eb.ref('excluded.title'),
        label: (eb) => eb.ref('excluded.label'),
        sort: (eb) => eb.ref('excluded.sort'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertBookContributor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookContributorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('bookContributor')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        name: (eb) => eb.ref('excluded.name'),
        role: (eb) => eb.ref('excluded.role'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertAudiobookFile = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<AudiobookFileTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('audiobookFile')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        libraryId: (eb) => eb.ref('excluded.libraryId'),
        bookId: (eb) => eb.ref('excluded.bookId'),
        path: (eb) => eb.ref('excluded.path'),
        mtimeMs: (eb) => eb.ref('excluded.mtimeMs'),
        metadataHash: (eb) => eb.ref('excluded.metadataHash'),
        durationMs: (eb) => eb.ref('excluded.durationMs'),
        disc: (eb) => eb.ref('excluded.disc'),
        track: (eb) => eb.ref('excluded.track'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertAudiobookChapter = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<AudiobookChapterTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('audiobookChapter')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        parentId: (eb) => eb.ref('excluded.parentId'),
        source: (eb) => eb.ref('excluded.source'),
        title: (eb) => eb.ref('excluded.title'),
        durationMs: (eb) => eb.ref('excluded.durationMs'),
        startOffsetMs: (eb) => eb.ref('excluded.startOffsetMs'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertEBookFile = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<EBookFileTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('ebookFile')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        libraryId: (eb) => eb.ref('excluded.libraryId'),
        bookId: (eb) => eb.ref('excluded.bookId'),
        path: (eb) => eb.ref('excluded.path'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

export const upsertPlaybackHistory = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<PlaybackHistoryTable<'realtime'>>[]
) => {
  return (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('playbackHistory')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        userId: (eb) => eb.ref('excluded.userId'),
        type: (eb) => eb.ref('excluded.type'),
        bookId: (eb) => eb.ref('excluded.bookId'),
        positionMs: (eb) => eb.ref('excluded.positionMs'),
        eventTimestampMs: (eb) => eb.ref('excluded.eventTimestampMs'),
        sessionId: (eb) => eb.ref('excluded.sessionId'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();
};

export const flushHistoryData = async (
  trx: Transaction<InstanceDatabase<'regular'>>,
  history: {
    rowCount: number;
    library: Insertable<LibraryTable<'realtime'>>[];
    contributor: Insertable<ContributorTable<'realtime'>>[];
    series: Insertable<SeriesTable<'realtime'>>[];
    book: Insertable<BookTable<'realtime'>>[];
    bookSeries: Insertable<BookSeriesTable<'realtime'>>[];
    bookContributor: Insertable<BookContributorTable<'realtime'>>[];
    audiobookFile: Insertable<AudiobookFileTable<'realtime'>>[];
    audiobookChapter: Insertable<AudiobookChapterTable<'realtime'>>[];
    ebookFile: Insertable<EBookFileTable<'realtime'>>[];
    playbackHistory: Insertable<PlaybackHistoryTable<'realtime'>>[];
  }
) => {
  if (history.library.length > 0) {
    await upsertLibrary(trx, history.library);
  }
  if (history.contributor.length > 0) {
    await upsertContributor(trx, history.contributor);
  }
  if (history.series.length > 0) {
    await upsertSeries(trx, history.series);
  }
  if (history.book.length > 0) {
    await upsertBook(trx, history.book);
  }
  if (history.bookSeries.length > 0) {
    await upsertBookSeries(trx, history.bookSeries);
  }
  if (history.bookContributor.length > 0) {
    await upsertBookContributor(trx, history.bookContributor);
  }
  if (history.audiobookFile.length > 0) {
    await upsertAudiobookFile(trx, history.audiobookFile);
  }
  if (history.audiobookChapter.length > 0) {
    await upsertAudiobookChapter(trx, history.audiobookChapter);
  }
  if (history.ebookFile.length > 0) {
    await upsertEBookFile(trx, history.ebookFile);
  }
  if (history.playbackHistory.length > 0) {
    await upsertPlaybackHistory(trx, history.playbackHistory);
  }
  history.library = [];
  history.contributor = [];
  history.series = [];
  history.book = [];
  history.bookSeries = [];
  history.bookContributor = [];
  history.audiobookFile = [];
  history.audiobookChapter = [];
  history.ebookFile = [];
  history.playbackHistory = [];
  history.rowCount = 0;
};

type Exact<TKnown, T extends TKnown> = {
  [Key in keyof T]: Key extends keyof TKnown
    ? T[Key] extends unknown[]
      ? Exclude<T[Key], undefined>
      : T[Key] extends object
        ? Exact<Exclude<TKnown[Key], undefined>, Exclude<T[Key], undefined>>
        : Exclude<T[Key], undefined>
    : never;
};

export const ensureExact = <TKnown, TUnknown extends TKnown>(t: Exact<TKnown, TUnknown>) =>
  t as TKnown;
