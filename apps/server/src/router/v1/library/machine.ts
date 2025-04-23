import axios from 'axios';
import { type Insertable, NoResultError } from 'kysely';
import { lstat, readdir, rmdir } from 'node:fs/promises';
import { basename, dirname, extname, join as pathJoin, sep as pathSep } from 'node:path';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import TurndownService from 'turndown';
import { Actor, createActor, setup } from 'xstate';

import {
  type AudibleBook,
  type AudibleChapters,
  type AudibleSeries,
  getAuthorByAsin,
  getChapterByAsin,
  getProductByAsin,
  isParentChapter,
  isProductSeries,
} from '@/router/v1/library/audible';
import { matchAlbumGroup } from '@/router/v1/library/matcher';
import { type AudioFile, getAudioFile } from '@/router/v1/library/scanner';

import { db } from '@/libs/db';
import {
  AudiobookChapterTable,
  type AuthorTable,
  type BookTable,
  type SeriesTable,
} from '@/libs/db/schema';

import { env } from '@/env';
import { scanLogger } from '@/logger';

const libraryActors = new Map<number, Actor<typeof libraryMachine>>();

const turndownService = new TurndownService();

export const getLibraryActor = (id: number, name: string) => {
  if (!libraryActors.has(id)) {
    libraryActors.set(id, createActor(libraryMachine, { input: { id, name } }).start());
  }
  return libraryActors.get(id)!;
};

export const removeLibraryActor = (id: number) => {
  const actor = libraryActors.get(id);
  if (actor) {
    actor.stop();
    return libraryActors.delete(id);
  }
  return false;
};

export const processInBatches = async <T, R>(
  batchSize: number,
  items: T[],
  promise: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> => {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batchPromises = [];
    const batchEnd = Math.min(i + batchSize, items.length);

    for (let j = i; j < batchEnd; j++) {
      const item = items[j]!;
      batchPromises.push(promise(item));
    }

    results.push(...(await Promise.allSettled(batchPromises)));

    scanLogger.debug('Processed batch %d to %d of %d items', i, batchEnd, items.length);
  }
  return results;
};

export async function deleteEmptyDirectories(libraryName: string) {
  const importPath = pathJoin(env.IMPORT_PATH, libraryName);
  const directoryEntries = await readdir(importPath, {
    recursive: true,
    withFileTypes: true,
  });

  const directoriesToDelete = new Set<string>();
  directoryEntries.forEach((e) => {
    if (e.isDirectory()) {
      directoriesToDelete.add(pathJoin(e.parentPath, e.name));
    }
  });

  const directoryWithFiles = new Set<string>();
  directoryEntries.forEach((e) => {
    if ((e.isFile() || e.isSymbolicLink()) && e.name !== '.DS_Store') {
      directoryWithFiles.add(e.parentPath);
    }
  });

  directoryWithFiles.forEach((i) => {
    scanLogger.debug('Will not delete directory "%s" since it contains files', i);
    directoriesToDelete.delete(i);
    directoriesToDelete.forEach((j) => {
      if (i.startsWith(pathJoin(j, pathSep))) {
        scanLogger.debug('Will not delete directory "%s" since its children contain files', j);
        directoriesToDelete.delete(j);
      }
    });
  });

  const sortedDirectories = Array.from(directoriesToDelete).sort((a, b) => b.length - a.length);

  sortedDirectories.forEach((dir) => {
    const parentDir = pathJoin(dir, '..');
    if (directoriesToDelete.has(parentDir)) {
      scanLogger.debug('Directory "%s" will be deleted via its parent directory', dir);
      directoriesToDelete.delete(dir);
    }
  });

  await Promise.allSettled(
    Array.from(directoriesToDelete).map((dir) => {
      scanLogger.info('Deleting directory "%s"', dir);
      return rmdir(dir, { recursive: true });
    })
  );
}

async function extractAudioFilesMetadata(libraryName: string) {
  const importPath = pathJoin(env.IMPORT_PATH, libraryName);
  const fileEntries = (
    await readdir(importPath, {
      recursive: true,
      withFileTypes: true,
    })
  ).filter((e) => !e.isDirectory());

  scanLogger.info('Found %d entries in library directory', fileEntries.length);

  const audioFiles = (
    await processInBatches(env.METADATA_EXTRACTION_BATCH_SIZE, fileEntries, (entry) =>
      getAudioFile(pathJoin(entry.parentPath, entry.name))
    )
  )
    .filter((file, i): file is PromiseFulfilledResult<AudioFile> => {
      if (file.status === 'fulfilled' && file.value !== null) {
        return true;
      }
      scanLogger.warn(
        'Failed to process file %s in %s',
        fileEntries[i]!.name,
        fileEntries[i]!.parentPath
      );
      return false;
    })
    .map((i) => i.value);

  scanLogger.debug(
    'Got metadata for %d valid audio files out of %d entries',
    audioFiles.length,
    fileEntries.length
  );

  return audioFiles;
}

function groupAudioFilesByAlbum<T extends AudioFile>(audioFiles: T[]) {
  const albumGroups: Record<string, T[]> = {};

  audioFiles.forEach((audioFile) => {
    const tags = audioFile.metadata.format.tags;
    const albumTitle = (tags['album'] || tags['title'])?.trim();
    const artistName = (tags['artist'] || tags['album_artist'])?.trim();

    const albumKey = `${albumTitle} by ${artistName}`;
    if (!albumGroups[albumKey]) {
      albumGroups[albumKey] = [];
    }
    albumGroups[albumKey].push(audioFile);
  });

  scanLogger.info(
    'Grouped %d files into %d distinct albums',
    audioFiles.length,
    Object.keys(albumGroups).length
  );

  return albumGroups;
}

function sortAlbumTracks<T extends AudioFile>(albumGroups: Record<string, T[]>) {
  Object.keys(albumGroups).forEach((albumKey) => {
    albumGroups[albumKey]!.sort((a, b) => {
      return (
        a.sortMetadata.discNumber - b.sortMetadata.discNumber ||
        a.sortMetadata.trackNumber - b.sortMetadata.trackNumber
      );
    });

    scanLogger.debug(
      'Album "%s": Sorted %d tracks by disc and track number',
      albumKey,
      albumGroups[albumKey]!.length
    );
  });
}

async function identifyBooks<T extends AudioFile>(albumGroups: Record<string, T[]>) {
  const albumGroupKeys = Object.keys(albumGroups);

  const booksWithoutThumbhashes = (
    await processInBatches(env.MATCHER_BATCH_SIZE, albumGroupKeys, (i) =>
      matchAlbumGroup(albumGroups[i]![0]!)
    )
  )
    .map((book, i) => ({ ...book, preFilterIndex: i }))
    .filter((book, i): book is PromiseFulfilledResult<AudibleBook> & { preFilterIndex: number } => {
      if (book.status === 'fulfilled' && book.value !== null) {
        scanLogger.debug(
          'Identified album: %s by %s',
          book.value.title,
          book.value.authors.map((a) => a.name).join(', ')
        );
        return true;
      }
      scanLogger.warn('Failed to identify album: %s', albumGroupKeys[i]);
      return false;
    })
    .map((book) => ({
      ...book.value,
      files: albumGroups[albumGroupKeys[book.preFilterIndex]!]!,
    }));

  const booksThumbhashes = await processInBatches(
    env.MATCHER_BATCH_SIZE,
    booksWithoutThumbhashes,
    (book) => generateThumbhash(book.product_images[500].replace(/\._S[A-Z]+500_\./, '._SL100_.'))
  );

  const books = booksWithoutThumbhashes.map((book, i) => ({
    ...book,
    coverThumbhash: booksThumbhashes[i]!.status === 'fulfilled' ? booksThumbhashes[i]!.value : null,
  }));

  return books;
}

async function fetchAuthorsAndSeries(books: AudibleBook[]) {
  const pendingAuthorAsins = new Set<string>();
  const pendingSeriesAsins = new Set<string>();

  for (const book of books) {
    for (const author of book.authors) {
      pendingAuthorAsins.add(author.asin);
    }

    if (book.series) {
      for (const serie of book.series) {
        pendingSeriesAsins.add(serie.asin);
      }
    }
  }

  return {
    authors: await fetchAuthorDetails(pendingAuthorAsins),
    series: await fetchSeriesDetails(pendingSeriesAsins),
  };
}

async function getAuthorByAsinWithThumbhash(asin: string) {
  const author = await getAuthorByAsin(asin);
  if (!author) return null;

  const avatarThumbhash = await generateThumbhash(
    author.avatar.replace(/\._S[A-Z]+500_\./, '._SL100_.')
  );

  return {
    asin,
    name: author.name,
    about: author.about,
    avatar: author.avatar,
    avatarThumbhash,
  };
}

async function fetchAuthorDetails(pendingAuthorAsins: Set<string>) {
  const authorAsinsArray = Array.from(pendingAuthorAsins);
  scanLogger.debug('Fetching details for %d unique authors', authorAsinsArray.length);

  const authorResults = await processInBatches(
    env.MATCHER_BATCH_SIZE,
    authorAsinsArray,
    getAuthorByAsinWithThumbhash
  );

  const authors = new Map<
    string,
    {
      asin: string;
      name: string;
      about: string;
      avatar: string;
      avatarThumbhash: string | null;
    }
  >();
  for (const [i, author] of authorResults.entries()) {
    if (author.status === 'rejected' || (author.status === 'fulfilled' && author.value === null)) {
      scanLogger.warn('Failed to fetch author for ASIN %s', authorAsinsArray[i]);
    } else if (author.value !== null) {
      scanLogger.debug('Author fetched successfully for ASIN %s', authorAsinsArray[i]);
      authors.set(authorAsinsArray[i]!, {
        asin: authorAsinsArray[i]!,
        name: author.value.name,
        about: author.value.about,
        avatar: author.value.avatar.replace(/\._S[A-Z]+500_\./, '.'),
        avatarThumbhash: author.value.avatarThumbhash,
      });
    }
  }

  return authors;
}

async function fetchSeriesDetails(pendingSeriesAsins: Set<string>) {
  const seriesAsinsArray = Array.from(pendingSeriesAsins);
  scanLogger.debug('Fetching details for %d series', seriesAsinsArray.length);

  const seriesResults = await processInBatches(
    env.MATCHER_BATCH_SIZE,
    seriesAsinsArray,
    getProductByAsin
  );

  const series = new Map<
    string,
    {
      asin: string;
      name: string;
      summary: string | null;
      relationships: AudibleSeries['relationships'];
    }
  >();
  seriesResults.forEach((serie, i) => {
    if (
      serie.status === 'rejected' ||
      (serie.status === 'fulfilled' && (serie.value === null || !isProductSeries(serie.value)))
    ) {
      scanLogger.warn('Failed to fetch series for ASIN %s', seriesAsinsArray[i]);
    } else if (serie.value !== null && isProductSeries(serie.value)) {
      scanLogger.debug('Series fetched successfully for ASIN %s', seriesAsinsArray[i]);
      series.set(seriesAsinsArray[i]!, {
        asin: seriesAsinsArray[i]!,
        name: serie.value.title,
        summary:
          typeof serie.value.publisher_summary === 'string'
            ? turndownService.turndown(serie.value.publisher_summary)
            : null,
        relationships: serie.value.relationships,
      });
    }
  });

  return series;
}

async function fetchBookChapters(books: AudibleBook[]) {
  const bookChapters = new Map<string, AudibleChapters>();

  const chapterResults = await processInBatches(env.MATCHER_BATCH_SIZE, books, (book) =>
    getChapterByAsin(book.asin)
  );

  chapterResults.forEach((chapter, i) => {
    if (
      chapter.status === 'rejected' ||
      (chapter.status === 'fulfilled' && chapter.value === null)
    ) {
      scanLogger.warn('Failed to fetch chapters for ASIN %s', books[i]!.asin);
    } else if (chapter.value !== null) {
      scanLogger.debug('Chapters fetched successfully for ASIN %s', books[i]!.asin);
      bookChapters.set(books[i]!.asin, chapter.value);
    }
  });

  return bookChapters;
}

type RequiredKeys<T extends object> = keyof {
  [K in keyof T as T extends Record<K, T[K]> ? K : never]: K;
};

type Concrete<T extends object> = Pick<T, RequiredKeys<T>>;

type AllPropsRequired<T> = Required<{ [P in keyof T]: Required<NonNullable<T[P]>> }>;

async function insertBooksIntoDatabase(
  library: { id: number },
  books: (AudibleBook & { coverThumbhash: string | null; files: AudioFile[] })[],
  authors: Map<
    string,
    {
      asin: string;
      name: string;
      about: string;
      avatar: string;
      avatarThumbhash: string | null;
    }
  >,
  series: Map<
    string,
    {
      asin: string;
      name: string;
      summary: string | null;
      relationships: AudibleSeries['relationships'];
    }
  >,
  bookChapters: Map<string, AudibleChapters>
) {
  for (const book of books) {
    try {
      const bookToInsert = await prepareBookData(book);

      const { basic: basicAuthors, complete: completeAuthors } = prepareAuthorData(
        book.authors,
        authors
      );

      const {
        basic: basicSeries,
        complete: completeSeries,
        bookSeries,
      } = prepareSeriesData(book.asin, book.series, series);

      await db.transaction().execute(async (trx) => {
        const insertedBook = await trx
          .insertInto('book')
          .values(bookToInsert)
          .returning(['id as id'])
          .executeTakeFirstOrThrow();

        let completeInsertedAuthors: { id: number }[] = [];
        if (completeAuthors.length > 0) {
          completeInsertedAuthors = await trx
            .insertInto('author')
            .values(completeAuthors)
            .onConflict((oc) =>
              oc.column('asin').doUpdateSet({
                name: (eb) => eb.ref('excluded.name'),
                about: (eb) => eb.ref('excluded.about'),
                avatar: (eb) => eb.ref('excluded.avatar'),
              })
            )
            .returning(['id as id'])
            .execute();

          if (completeAuthors.length !== completeInsertedAuthors.length) {
            throw new Error(
              `${completeInsertedAuthors.length} authors inserted when we expected ${completeAuthors.length} authors to be inserted`
            );
          }
        }

        let insertedAuthors: { id: number }[] = [];
        if (basicAuthors.length > 0) {
          insertedAuthors = await trx
            .insertInto('author')
            .values(basicAuthors)
            .onConflict((oc) =>
              oc.column('asin').doUpdateSet({ name: (eb) => eb.ref('excluded.name') })
            )
            .returning(['id as id'])
            .execute();
        }

        insertedAuthors.push(...completeInsertedAuthors);

        if (insertedAuthors.length === 0 || insertedAuthors.length !== book.authors.length) {
          throw new Error(
            `${insertedAuthors.length} authors inserted when we expected ${book.authors.length} authors to be inserted`
          );
        }

        let completeInsertedSeries: { id: number; asin: string }[] = [];
        if (completeSeries.length > 0) {
          completeInsertedSeries = await trx
            .insertInto('series')
            .values(completeSeries)
            .onConflict((oc) =>
              oc.column('asin').doUpdateSet({
                name: (eb) => eb.ref('excluded.name'),
                summary: (eb) => eb.ref('excluded.summary'),
              })
            )
            .returning(['id as id', 'asin as asin'])
            .execute();

          if (completeSeries.length !== completeInsertedSeries.length) {
            throw new Error(
              `${completeInsertedSeries.length} series inserted when we expected ${completeSeries.length} series to be inserted`
            );
          }
        }

        let insertedSeries: { id: number; asin: string }[] = [];
        if (basicSeries.length > 0) {
          insertedSeries = await trx
            .insertInto('series')
            .values(basicSeries)
            .onConflict((oc) => {
              return oc.column('asin').doNothing();
            })
            .returning(['id as id', 'asin as asin'])
            .execute();
        }

        insertedSeries.push(...completeInsertedSeries);

        if (
          Array.isArray(book.series) &&
          book.series.length > 0 &&
          (insertedSeries.length === 0 || insertedSeries.length !== book.series.length)
        ) {
          throw new Error(
            `${insertedSeries.length} series inserted when we expected ${book.series.length} series to be inserted`
          );
        }

        await trx
          .insertInto('bookAuthor')
          .values(
            insertedAuthors.map((a) => ({
              bookId: insertedBook.id,
              authorId: a.id,
            }))
          )
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('bookSeries')
          .values(
            bookSeries.map((i) => ({
              bookId: insertedBook.id,
              seriesId: insertedSeries.find((s) => s.asin === i.seriesAsin)!.id,
              label: i.label,
              sort: i.sort,
            }))
          )
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('bookContributor')
          .values(
            book.narrators.map((n) => ({
              bookId: insertedBook.id,
              role: 'narrator',
              name: n.name,
            }))
          )
          .executeTakeFirstOrThrow();

        const insertedFiles = await trx
          .insertInto('audiobookFile')
          .values(
            book.files.map((file) => ({
              libraryId: library.id,
              bookId: insertedBook.id,
              path: file.realPath,
              duration: Math.round(file.metadata.format.duration * 1000),
              disc: file.sortMetadata.discNumber,
              track: file.sortMetadata.trackNumber,
            }))
          )
          .returning(['id as id', 'path as path'])
          .execute();

        if (insertedFiles.length === 0) {
          throw new Error(`At least one file should be inserted`);
        }

        if (insertedFiles.length !== book.files.length) {
          throw new Error(
            `${insertedFiles.length} files inserted when we expected ${book.files.length} files to be inserted`
          );
        }

        const fileChapters = book.files
          .map((file, index) =>
            file.metadata.chapters.map((c) => {
              const startTime = c.start_time * 1000;
              const endTime = c.end_time * 1000;
              return {
                bookId: insertedBook.id,
                parentId: null,
                fileId: insertedFiles[index]!.id,
                source: 'file' as const,
                title: c.tags.title,
                durationMs: Math.round(endTime - startTime),
                startOffsetMs: Math.round(startTime),
              };
            })
          )
          .flat();

        if (fileChapters.length > 0) {
          await trx
            .insertInto('audiobookChapter')
            .values(
              ensureExact<Insertable<AudiobookChapterTable>[], typeof fileChapters>(fileChapters)
            )
            .executeTakeFirstOrThrow();
        } else {
          await trx
            .insertInto('audiobookChapter')
            .values(
              book.files.map((file, index) => ({
                bookId: insertedBook.id,
                parentId: null,
                fileId: insertedFiles[index]!.id,
                source: 'file' as const,
                title:
                  file.metadata.format.tags?.title ??
                  basename(file.realPath, extname(file.realPath)),
                durationMs: Math.round(file.metadata.format.duration * 1000),
                startOffsetMs: 0,
              }))
            )
            .executeTakeFirstOrThrow();
        }

        if (bookChapters.has(book.asin)) {
          const currentChapterTableId = await trx
            .selectFrom('sqlite_sequence')
            .select('seq')
            .where('name', '=', 'audiobookChapter')
            .executeTakeFirstOrThrow()
            .catch((e) => {
              if (e instanceof NoResultError) {
                return { seq: 0 };
              }
              throw e;
            });

          const flatChapters: {
            id: number;
            parentId: number | null;
            chapter: (typeof audibleChaptersData)[number];
          }[] = [];

          const audibleChaptersData = bookChapters.get(book.asin)!.chapters;
          const traverse = (
            chapter: (typeof audibleChaptersData)[number],
            parentId: number | null
          ) => {
            const currentChapterId = ++currentChapterTableId.seq;
            flatChapters.push({ id: currentChapterId, parentId, chapter });

            if (isParentChapter(chapter)) {
              chapter.chapters.forEach((childChapter) => {
                traverse(childChapter, currentChapterId);
              });
            }
          };

          for (const chapter of audibleChaptersData) {
            traverse(chapter, null);
          }

          const insertedChapters = await trx
            .insertInto('audiobookChapter')
            .values(
              flatChapters.map((chapter) => ({
                bookId: insertedBook.id,
                parentId: chapter.parentId,
                fileId: null,
                source: 'audible' as const,
                title: chapter.chapter.title,
                durationMs: chapter.chapter.length_ms,
                startOffsetMs: chapter.chapter.start_offset_ms,
              }))
            )
            .returning(['id as id', 'parentId as parentId'])
            .execute();

          const insertedChapterIds = insertedChapters.map((chapter) => chapter.id);
          const flatChapterIds = flatChapters.map((chapter) => chapter.id);

          if (
            !(
              insertedChapterIds.length === flatChapterIds.length &&
              insertedChapterIds.every((e, i) => e === flatChapterIds[i])
            )
          ) {
            throw new Error('Inserted chapter IDs do not match flat chapter IDs');
          }

          const insertedParentIds = insertedChapters.map((chapter) => chapter.parentId);
          const flatParentIds = flatChapters.map((chapter) => chapter.parentId);

          if (
            !(
              insertedParentIds.length === flatParentIds.length &&
              insertedParentIds.every((e, i) => e === flatParentIds[i])
            )
          ) {
            throw new Error('Inserted parent IDs do not match flat parent IDs');
          }
        }
      });

      const walkedDeletes = new Set<string>();
      for (const audiobookFile of book.files) {
        if (walkedDeletes.values().find((i) => audiobookFile.path.startsWith(i))) {
          scanLogger.debug(
            'Will not delete "%s" because it should already be deleted',
            audiobookFile.path
          );
          continue;
        }
        const stat = await lstat(audiobookFile.path);
        if (stat.isSymbolicLink()) {
          scanLogger.debug('Will delete imported symlink "%s"', audiobookFile.path);
          await Bun.file(audiobookFile.path).delete();
          break;
        } else {
          // walk up the directory until we find the symlink to delete it
          let currentPath = audiobookFile.path;
          while (currentPath !== env.IMPORT_PATH) {
            const parentPath = dirname(currentPath);
            const parentStat = await lstat(parentPath);
            if (parentStat.isSymbolicLink()) {
              scanLogger.debug('Will delete imported symlink "%s" found by walking up', parentPath);
              await Bun.file(parentPath).delete();
              walkedDeletes.add(parentPath);
              break;
            }
            currentPath = parentPath;
          }
        }
        scanLogger.warn('Did not delete imported file "%s"', audiobookFile.path);
      }

      scanLogger.debug('Successfully inserted book "%s"', book.title);
    } catch (error) {
      scanLogger.error(
        'Failed to insert book %s: %s',
        book.title,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

async function generateThumbhash(imageURL: string) {
  scanLogger.debug('Generating thumbhash for image %s', imageURL);
  const imageBuffer = await axios.get(imageURL, { responseType: 'arraybuffer' });
  const image = sharp(imageBuffer.data).resize({
    width: 100,
    height: 100,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  try {
    const thumbhash = Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString(
      'base64'
    );
    return thumbhash;
  } catch (error) {
    scanLogger.warn('Failed to generate thumbhash for image %s: %s', imageURL, error);
  }
  return null;
}

async function prepareBookData(book: AudibleBook & { coverThumbhash: string | null }) {
  return {
    asin: book.asin,
    type: 'audio',
    title: book.title,
    subtitle: book.subtitle,
    cover: book.product_images['500'].replace(/\._S[A-Z]+500_\./, '.'),
    coverThumbhash: book.coverThumbhash,
    summary: turndownService.turndown(book.publisher_summary),
    adultsOnly: book.is_adult_product ? 1 : 0,
  } satisfies Insertable<BookTable>;
}

type IterableElementType<T extends Iterable<unknown>> = T extends Iterable<infer E> ? E : never;

function prepareAuthorData(
  authorsFromBook: AudibleBook['authors'],
  authorsFromAudible: Map<
    string,
    {
      asin: string;
      name: string;
      about: string;
      avatar: string;
      avatarThumbhash: string | null;
    }
  >
) {
  const complete: (AllPropsRequired<Omit<Insertable<AuthorTable>, 'avatarThumbhash'>> &
    Pick<Insertable<AuthorTable>, 'avatarThumbhash'>)[] = [];
  const basic: Concrete<Insertable<AuthorTable>>[] = [];

  for (const author of authorsFromBook) {
    const completeAuthor = authorsFromAudible.get(author.asin);
    if (completeAuthor) {
      complete.push(
        ensureExact<IterableElementType<typeof complete>, typeof completeAuthor>(completeAuthor)
      );
    } else {
      basic.push(ensureExact<IterableElementType<typeof basic>, typeof author>(author));
    }
  }

  return { complete, basic };
}

function prepareSeriesData(
  bookAsin: AudibleBook['asin'],
  seriesFromBook: AudibleBook['series'],
  seriesFromAudible: Map<
    string,
    {
      asin: string;
      name: string;
      summary: string | null;
      relationships: AudibleSeries['relationships'];
    }
  >
) {
  const complete: Insertable<SeriesTable>[] = [];
  const basic: Concrete<Insertable<SeriesTable>>[] = [];
  const bookSeries: { label: string; sort: number; seriesAsin: string }[] = [];

  if (seriesFromBook) {
    for (const series of seriesFromBook) {
      const audibleSeries = seriesFromAudible.get(series.asin);
      if (audibleSeries) {
        complete.push(
          ensureExact<
            IterableElementType<typeof complete>,
            Omit<typeof audibleSeries, 'relationships'>
          >({
            asin: audibleSeries.asin,
            name: audibleSeries.name,
            summary: audibleSeries.summary,
          })
        );
      } else {
        basic.push({ asin: series.asin, name: series.title });
      }

      const parsedSequence = parseInt(series.sequence, 10);
      const seriesInfo = {
        label: series.sequence,
        sort: isNaN(parsedSequence) ? 0 : parsedSequence,
        seriesAsin: series.asin,
      };

      if (audibleSeries && Array.isArray(audibleSeries.relationships)) {
        const index = audibleSeries.relationships.findIndex((s) => s.asin === bookAsin);
        if (index !== -1) {
          seriesInfo.label = audibleSeries.relationships[index]!.sequence;
          seriesInfo.sort = audibleSeries.relationships[index]!.sort;
        }
      }

      bookSeries.push(seriesInfo);
    }
  }

  return { complete, basic, bookSeries };
}

type Exact<TKnown, T extends TKnown> = {
  [Key in keyof T]: Key extends keyof TKnown
    ? T[Key] extends unknown[]
      ? Exclude<T[Key], undefined>
      : T[Key] extends object
        ? Exact<Exclude<TKnown[Key], undefined>, Exclude<T[Key], undefined>>
        : Exclude<T[Key], undefined>
    : never;
};

const ensureExact = <TKnown, TUnknown extends TKnown>(t: Exact<TKnown, TUnknown>) => t as TKnown;

const libraryMachine = setup({
  types: {
    context: {} as { id: number; name: string },
    input: {} as { id: number; name: string },
  },
  actions: {
    scanImportPath: async ({ context, self }) => {
      scanLogger.info('Starting library scan: %s', context.name);

      try {
        const audioFiles = await extractAudioFilesMetadata(context.name);

        const albumGroups = groupAudioFilesByAlbum(audioFiles);

        sortAlbumTracks(albumGroups);

        const books = await identifyBooks(albumGroups);

        const { authors, series } = await fetchAuthorsAndSeries(books);

        const bookChapters = await fetchBookChapters(books);

        await insertBooksIntoDatabase(context, books, authors, series, bookChapters);

        await deleteEmptyDirectories(context.name);

        scanLogger.debug('Library scan complete: %s', context.name);
        scanLogger.debug(
          'Summary: %d files, %d albums, %d identified books',
          audioFiles.length,
          Object.keys(albumGroups).length,
          books.length
        );
      } catch (error) {
        scanLogger.error('Error during library scan: %o', error);
      } finally {
        self.send({ type: 'scanComplete' });
      }
    },
  },
}).createMachine({
  id: 'library',
  initial: 'idle',
  context: (opts) => opts.input,
  states: {
    idle: {
      on: {
        scan: { target: 'scanning' },
        scanComplete: { target: undefined },
      },
    },
    scanning: {
      entry: [{ type: 'scanImportPath' }],
      on: {
        scan: { target: undefined },
        scanComplete: { target: 'idle' },
      },
    },
  },
});
