import { baseFilesSQLQuery } from '../books';
import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Kysely, Selectable } from 'kysely';

import type { InstanceDatabase } from '~/db/schema/instance';

import AudioModule from '~/modules/voel-audio';

const getAvailableOffline = {
  queryKey: ['instance', 'feeds', 'getAvailableOffline'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, instanceId: string) => {
    return useReactQuery({
      queryKey: [...getAvailableOffline.queryKey, instanceId],
      queryFn: async () => {
        const downloadIds = await AudioModule.getAllDownloadIds(instanceId);

        // we don't filter by deletedAt on purpose to allow the UI to show a cleanup button
        let authorSubquery = instanceDb
          .selectFrom('bookAuthor')
          .innerJoin('author', (join) => join.onRef('author.id', '=', 'bookAuthor.authorId'))
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
                  eb.ref('author.avatarThumbhash'),
                  eb.val('deletedAt'),
                  eb.ref('author.deletedAt'),
                ]),
              ])
              .as('authors'),
          ])
          .groupBy('bookAuthor.bookId')
          .as('authorData');

        let filesSubquery = instanceDb
          .selectFrom('audiobookFile')
          .select((eb) => [
            'audiobookFile.bookId as bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('audiobookFile.id'),
                  eb.val('durationMs'),
                  eb.ref('audiobookFile.durationMs'),
                  eb.val('disc'),
                  eb.ref('audiobookFile.disc'),
                  eb.val('track'),
                  eb.ref('audiobookFile.track'),
                  eb.val('libraryId'),
                  eb.ref('audiobookFile.libraryId'),
                  eb.val('path'),
                  eb.ref('audiobookFile.path'),
                  eb.val('deletedAt'),
                  eb.ref('audiobookFile.deletedAt'),
                ]),
              ])
              .as('files'),
          ])
          .where('audiobookFile.id', 'in', downloadIds)
          .groupBy('audiobookFile.bookId')
          .as('fileData');

        const results = await instanceDb
          .selectFrom('book')
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
            'book.deletedAt',
          ])
          .innerJoin(filesSubquery, (join) => join.onRef('book.id', '=', 'fileData.bookId'))
          .leftJoin(authorSubquery, (join) => join.onRef('book.id', '=', 'authorData.bookId'))
          .select(['authorData.authors'])
          .execute();

        return results.map((result) => ({
          ...result,
          authors: result.authors
            ? (JSON.parse(result.authors) as Pick<
                Selectable<InstanceDatabase['author']>,
                'id' | 'name' | 'avatar' | 'avatarThumbhash' | 'deletedAt'
              >[])
            : [],
        }));
      },
    });
  },
};

const getContinueListening = {
  queryKey: ['instance', 'feeds', 'getContinueListening'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, instanceId: string) => {
    return useReactQuery({
      queryKey: [...getContinueListening.queryKey, instanceId],
      queryFn: async () => {
        let query = instanceDb
          .with('playbackHistoryBooks', (db) =>
            db
              .selectFrom('playbackHistory')
              .where('deletedAt', 'is', null)
              .select(({ fn }) => [
                'id',
                'bookId',
                'updatedAt',
                fn.max('updatedAt').as('updatedAt'),
              ])
              .groupBy(['playbackHistory.bookId'])
          )
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
          .innerJoin('playbackHistoryBooks', (join) =>
            join.onRef('book.id', '=', 'playbackHistoryBooks.bookId')
          )
          .leftJoin('bookAuthor', (join) =>
            join.onRef('book.id', '=', 'bookAuthor.bookId').on('bookAuthor.deletedAt', 'is', null)
          )
          .leftJoin('author', (join) =>
            join.onRef('author.id', '=', 'bookAuthor.authorId').on('author.deletedAt', 'is', null)
          )
          .groupBy('book.id')
          .orderBy('playbackHistoryBooks.updatedAt', 'desc')
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

export { getAvailableOffline, getContinueListening };
