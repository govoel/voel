import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import { feedsQueryKeys } from '~/lib/api/feeds/query-keys';
import type { InstanceDatabase } from '~/lib/db/schema/instance';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';
import { getRole } from '~/lib/utils';

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

        const role = await getRole(instanceId);

        let query = instanceDb
          .with('downloadedAudiobookFiles', (eb) =>
            eb.selectFrom('audiobookFile').select('audiobookFile.bookId').distinct().where(
              'audiobookFile.id',
              'in',
              // @ts-expect-error: Things are fine at runtime even if I pass `downloadIds` as `string[]`
              downloadIds
            )
          )
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookAuthor')
              .innerJoin('downloadedAudiobookFiles', (join) =>
                join.onRef('bookAuthor.bookId', '=', 'downloadedAudiobookFiles.bookId')
              )
              .innerJoin('author', (join) => join.onRef('author.id', '=', 'bookAuthor.authorId'))
              .select((eb) => [
                'bookAuthor.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'author.id',
                      eb.val('name'),
                      'author.name',
                    ]),
                  ])
                  .as('authors'),
              ])
              .groupBy('bookAuthor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .innerJoin('downloadedAudiobookFiles', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'downloadedAudiobookFiles.bookId')
              )
              .select((eb) => [
                'audiobookFile.bookId as bookId',
                eb.fn.sum<number>('audiobookFile.durationMs').as('totalDurationMs'),
              ])
              .groupBy('audiobookFile.bookId')
          )
          .selectFrom('book')
          .select(['book.id', 'book.title', 'book.cover', 'book.coverThumbhash'])
          .innerJoin('audiobookFileDurations', (join) =>
            join.onRef('audiobookFileDurations.bookId', '=', 'book.id')
          )
          .leftJoin('authorsArray', (join) => join.onRef('authorsArray.bookId', '=', 'book.id'))
          .leftJoin('latestPlaybackPosition', (join) =>
            join.onRef('latestPlaybackPosition.bookId', '=', 'book.id')
          )
          .select((eb) => [
            'authorsArray.authors',
            'audiobookFileDurations.totalDurationMs',
            eb
              .fn<string>('json_object', [
                eb.val('positionMs'),
                eb.fn.coalesce('latestPlaybackPosition.positionMs', eb.lit(0)),
                eb.val('eventTimestampMs'),
                eb.fn.coalesce('latestPlaybackPosition.eventTimestampMs', eb.lit(0)),
              ])
              .as('playbackPosition'),
          ]);

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          playbackPosition: JSON.parse(result.playbackPosition) as {
            positionMs: number;
            eventTimestampMs: number;
          },
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
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookAuthor')
              .where('bookAuthor.deletedAt', 'is', null)
              .innerJoin('latestPlaybackPosition', (join) =>
                join.onRef('bookAuthor.bookId', '=', 'latestPlaybackPosition.bookId')
              )
              .innerJoin('author', (join) =>
                join
                  .onRef('author.id', '=', 'bookAuthor.authorId')
                  .on('author.deletedAt', 'is', null)
              )
              .select((eb) => [
                'bookAuthor.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'author.id',
                      eb.val('name'),
                      'author.name',
                    ]),
                  ])
                  .as('authors'),
              ])
              .groupBy('bookAuthor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.deletedAt', 'is', null)
              .innerJoin('latestPlaybackPosition', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'latestPlaybackPosition.bookId')
              )
              .select((eb) => [
                'audiobookFile.bookId as bookId',
                eb.fn.sum<number | null>('audiobookFile.durationMs').as('totalDurationMs'),
              ])
              .groupBy('audiobookFile.bookId')
          )
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .select(['book.id', 'book.title', 'book.cover', 'book.coverThumbhash'])
          .innerJoin('latestPlaybackPosition', (join) =>
            join.onRef('book.id', '=', 'latestPlaybackPosition.bookId')
          )
          .orderBy('latestPlaybackPosition.eventTimestampMs', 'desc')
          .leftJoin('audiobookFileDurations', (join) =>
            join.onRef('audiobookFileDurations.bookId', '=', 'book.id')
          )
          .leftJoin('authorsArray', (join) => join.onRef('authorsArray.bookId', '=', 'book.id'))
          .select((eb) => [
            'authorsArray.authors',
            eb.fn
              .coalesce('audiobookFileDurations.totalDurationMs', eb.lit(0))
              .as('totalDurationMs'),
            eb
              .fn<string>('json_object', [
                eb.val('positionMs'),
                'latestPlaybackPosition.positionMs',
                eb.val('eventTimestampMs'),
                'latestPlaybackPosition.eventTimestampMs',
              ])
              .as('playbackPosition'),
          ]);

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          playbackPosition: JSON.parse(result.playbackPosition) as {
            positionMs: number;
            eventTimestampMs: number;
          },
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
