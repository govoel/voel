import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, Selectable } from 'kysely';

import { InstanceDatabase } from '~/db/schema/instance';

const list = {
  queryKey: ['books', 'list'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>) => {
    return useReactQuery({
      queryKey: list.queryKey,
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .select([
            'book.id',
            'book.asin',
            'book.title',
            'book.subtitle',
            'book.cover',
            'book.coverThumbhash',
            'book.summary',
            'book.adultsOnly',
            'book.createdAt',
            'book.updatedAt',
          ])
          .leftJoin('bookAuthor', (join) =>
            join.onRef('book.id', '=', 'bookAuthor.bookId').on('bookAuthor.deletedAt', 'is', null)
          )
          .leftJoin('author', (join) =>
            join.onRef('author.id', '=', 'bookAuthor.authorId').on('author.deletedAt', 'is', null)
          )
          .groupBy('book.id')
          .select((eb) => [
            eb
              .fn<string>('json_group_array', [
                eb.fn('json_object', [
                  eb.val('id'),
                  eb.ref('author.id'),
                  eb.val('name'),
                  eb.ref('author.name'),
                ]),
              ])
              .as('authors'),
          ]);

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          authors: (result.authors ? JSON.parse(result.authors) : []) as Pick<
            Selectable<InstanceDatabase['author']>,
            'id' | 'name'
          >[],
        }));
      },
    });
  },
};

const get = {
  queryKey: ['books', 'get'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, bookId: number) => {
    return useReactQuery({
      queryKey: [...list.queryKey, { bookId }],
      networkMode: 'always',
      queryFn: async () => {
        let authorSubquery = instanceDb
          .selectFrom('bookAuthor')
          .innerJoin('author', (join) =>
            join.onRef('author.id', '=', 'bookAuthor.authorId').on('author.deletedAt', 'is', null)
          )
          .where('bookAuthor.deletedAt', 'is', null)
          .where('bookAuthor.bookId', '=', bookId)
          .select((eb) => [
            'bookAuthor.bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('author.id'),
                  eb.val('name'),
                  eb.ref('author.name'),
                  eb.val('avatar'),
                  eb.ref('author.avatar'),
                  eb.val('avatarThumbhash'),
                  eb.val('author.avatarThumbhash'),
                ]),
              ])
              .as('authors'),
          ])
          .groupBy('bookAuthor.bookId')
          .as('authorData');

        let seriesSubquery = instanceDb
          .selectFrom('bookSeries')
          .innerJoin('series', (join) =>
            join.onRef('series.id', '=', 'bookSeries.seriesId').on('series.deletedAt', 'is', null)
          )
          .where('bookSeries.deletedAt', 'is', null)
          .where('bookSeries.bookId', '=', bookId)
          .select((eb) => [
            'bookSeries.bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('series.id'),
                  eb.val('sort'),
                  eb.ref('bookSeries.sort'),
                  eb.val('label'),
                  eb.ref('bookSeries.label'),
                  eb.val('name'),
                  eb.ref('series.name'),
                ]),
              ])
              .as('series'),
          ])
          .groupBy('bookSeries.bookId')
          .as('seriesData');

        let contributorSubquery = instanceDb
          .selectFrom('bookContributor')
          .where('bookContributor.deletedAt', 'is', null)
          .where('bookContributor.bookId', '=', bookId)
          .select((eb) => [
            'bookContributor.bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('bookContributor.id'),
                  eb.val('role'),
                  eb.ref('bookContributor.role'),
                  eb.val('name'),
                  eb.ref('bookContributor.name'),
                ]),
              ])
              .as('contributors'),
          ])
          .groupBy('bookContributor.bookId')
          .as('contributorData');

        let audibleChapterSubquery = instanceDb
          .selectFrom('audiobookChapter')
          .where('audiobookChapter.source', '=', 'audible')
          .where('audiobookChapter.deletedAt', 'is', null)
          .where('audiobookChapter.bookId', '=', bookId)
          .select((eb) => [
            'audiobookChapter.bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('audiobookChapter.id'),
                  eb.val('parentId'),
                  eb.ref('audiobookChapter.parentId'),
                  eb.val('title'),
                  eb.ref('audiobookChapter.title'),
                  eb.val('duration'),
                  eb.ref('audiobookChapter.duration'),
                  eb.val('startOffset'),
                  eb.ref('audiobookChapter.startOffset'),
                ]),
              ])
              .as('audibleChapters'),
          ])
          .groupBy('audiobookChapter.bookId')
          .as('audibleChapterData');

        let fileChapterSubquery = instanceDb
          .selectFrom('audiobookChapter')
          .where('audiobookChapter.source', '=', 'file')
          .where('audiobookChapter.deletedAt', 'is', null)
          .where('audiobookChapter.bookId', '=', bookId)
          .select((eb) => [
            'audiobookChapter.bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('audiobookChapter.id'),
                  eb.val('title'),
                  eb.ref('audiobookChapter.title'),
                  eb.val('duration'),
                  eb.ref('audiobookChapter.duration'),
                  eb.val('startOffset'),
                  eb.ref('audiobookChapter.startOffset'),
                ]),
              ])
              .as('fileChapters'),
          ])
          .groupBy('audiobookChapter.bookId')
          .as('fileChapterData');

        let filesSubquery = instanceDb
          .selectFrom('audiobookFile')
          .where('audiobookFile.deletedAt', 'is', null)
          .where('audiobookFile.id', '=', bookId)
          .select((eb) => [
            'audiobookFile.id as bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('audiobookFile.id'),
                  eb.val('duration'),
                  eb.ref('audiobookFile.duration'),
                  eb.val('disc'),
                  eb.ref('audiobookFile.disc'),
                  eb.val('track'),
                  eb.ref('audiobookFile.track'),
                  eb.val('libraryId'),
                  eb.ref('audiobookFile.libraryId'),
                  eb.val('path'),
                  eb.ref('audiobookFile.path'),
                ]),
              ])
              .as('files'),
          ])
          .groupBy('audiobookFile.id')
          .as('fileData');

        let query = instanceDb
          .selectFrom('book')
          .where('book.id', '=', bookId)
          .where('book.deletedAt', 'is', null)
          .select([
            'book.id',
            'book.asin',
            'book.title',
            'book.subtitle',
            'book.cover',
            'book.coverThumbhash',
            'book.summary',
            'book.adultsOnly',
            'book.createdAt',
            'book.updatedAt',
          ])
          .leftJoin(authorSubquery, (join) => join.onRef('book.id', '=', 'authorData.bookId'))
          .leftJoin(seriesSubquery, (join) => join.onRef('book.id', '=', 'seriesData.bookId'))
          .leftJoin(contributorSubquery, (join) =>
            join.onRef('book.id', '=', 'contributorData.bookId')
          )
          .leftJoin(audibleChapterSubquery, (join) =>
            join.onRef('book.id', '=', 'audibleChapterData.bookId')
          )
          .leftJoin(fileChapterSubquery, (join) =>
            join.onRef('book.id', '=', 'fileChapterData.bookId')
          )
          .leftJoin(filesSubquery, (join) => join.onRef('book.id', '=', 'fileData.bookId'))
          .select([
            'authorData.authors',
            'seriesData.series',
            'contributorData.contributors',
            'audibleChapterData.audibleChapters',
            'fileChapterData.fileChapters',
            'fileData.files',
          ]);

        const result = await query.executeTakeFirstOrThrow();

        return {
          id: result.id,
          asin: result.asin,
          title: result.title,
          subtitle: result.subtitle,
          cover: result.cover,
          coverThumbhash: result.coverThumbhash,
          summary: result.summary,
          adultsOnly: result.adultsOnly,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          authors: result.authors
            ? (JSON.parse(result.authors) as Pick<
                Selectable<InstanceDatabase['author']>,
                'id' | 'name' | 'avatar' | 'avatarThumbhash'
              >[])
            : [],
          series: result.series
            ? (JSON.parse(result.series) as (Pick<
                Selectable<InstanceDatabase['series']>,
                'id' | 'name'
              > &
                Pick<Selectable<InstanceDatabase['bookSeries']>, 'sort' | 'label'>)[])
            : [],
          contributors: result.contributors
            ? (JSON.parse(result.contributors) as Pick<
                Selectable<InstanceDatabase['bookContributor']>,
                'id' | 'role' | 'name'
              >[])
            : [],
          chapters: {
            audible: result.audibleChapters
              ? (JSON.parse(result.audibleChapters) as Pick<
                  Selectable<InstanceDatabase['audiobookChapter']>,
                  'id' | 'parentId' | 'title' | 'duration' | 'startOffset'
                >[])
              : [],
            file: result.fileChapters
              ? (JSON.parse(result.fileChapters) as Pick<
                  Selectable<InstanceDatabase['audiobookChapter']>,
                  'id' | 'title' | 'duration' | 'startOffset'
                >[])
              : [],
          },
          files: result.files
            ? (JSON.parse(result.files) as Pick<
                Selectable<InstanceDatabase['audiobookFile']>,
                'id' | 'duration' | 'disc' | 'track' | 'libraryId' | 'path'
              >[])
            : [],
        };
      },
    });
  },
};

export { list, get };
