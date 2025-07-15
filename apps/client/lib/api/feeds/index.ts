import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import { mainDb } from '~/db/client';
import type { InstanceDatabase } from '~/db/schema/instance';

import { feedsQueryKeys } from '~/lib/api/feeds/query-keys';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';

import AudioModule from '~/modules/voel-audio';

const getAvailableOffline = {
  useQuery: () => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: feedsQueryKeys.getAvailableOffline(instanceId),
      networkMode: 'always',
      queryFn: async () => {
        const downloadIds = await AudioModule.getAllDownloadIds(instanceId);

        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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
            eb.fn.sum('audiobookFile.durationMs').as('durationMs'),
          ])
          .where('audiobookFile.id', 'in', downloadIds)
          .groupBy('audiobookFile.bookId')
          .as('fileData');

        let query = instanceDb
          .with('playbackHistoryBooks', (db) =>
            db
              .selectFrom('playbackHistory')
              .select(({ fn }) => [
                'id',
                'bookId',
                'positionMs',
                fn.max('updatedAt').as('updatedAt'),
              ])
              .groupBy('playbackHistory.bookId')
          )
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
          .leftJoin('playbackHistoryBooks', (join) =>
            join.onRef('playbackHistoryBooks.bookId', '=', 'book.id')
          )
          .select((eb) => [
            'authorData.authors',
            eb.fn
              .coalesce(eb.fn.sum<number | null>('fileData.durationMs'), eb.lit(0))
              .as('totalDurationMs'),
            eb.fn.coalesce('playbackHistoryBooks.positionMs', eb.lit(0)).as('playbackPositionMs'),
            eb.fn
              .coalesce('playbackHistoryBooks.updatedAt', eb.lit(0))
              .as('playbackPositionUpdatedAt'),
          ])
          .groupBy('book.id');

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const results = await query.execute();

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
  useQuery: () => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: feedsQueryKeys.getContinueListening(instanceId),
      networkMode: 'always',
      queryFn: async () => {
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

        let query = instanceDb
          .with('playbackHistoryBooks', (db) =>
            db
              .selectFrom('playbackHistory')
              .where('deletedAt', 'is', null)
              .select(({ fn }) => [
                'id',
                'bookId',
                'positionMs',
                fn.max('updatedAt').as('updatedAt'),
              ])
              .groupBy('playbackHistory.bookId')
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
          .leftJoin('audiobookFile', (join) =>
            join
              .onRef('audiobookFile.bookId', '=', 'book.id')
              .on('audiobookFile.deletedAt', 'is', null)
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
            eb.fn
              .coalesce(eb.fn.sum<number | null>('audiobookFile.durationMs'), eb.lit(0))
              .as('totalDurationMs'),
            eb.fn.coalesce('playbackHistoryBooks.positionMs', eb.lit(0)).as('playbackPositionMs'),
            eb.fn
              .coalesce('playbackHistoryBooks.updatedAt', eb.lit(0))
              .as('playbackPositionUpdatedAt'),
          ]);

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

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
