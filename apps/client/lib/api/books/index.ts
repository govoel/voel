import {
  useInfiniteQuery as useInfiniteReactQuery,
  useQuery as useReactQuery,
} from '@tanstack/react-query';
import type { Selectable } from 'kysely';
import { useEffect, useState } from 'react';

import { usePlaybackHistoryContext } from '~/components/playback-history-provider';

import type { InstanceDatabase } from '~/lib/db/schema/instance';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';
import { getRole } from '~/lib/utils';

export const booksQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'books'] as const,
  list: (instanceId: string) => [...booksQueryKeys.all(instanceId), 'list'] as const,
  listInfinite: (instanceId: string, pageSize: number) =>
    [...booksQueryKeys.all(instanceId), 'listInfinite', { pageSize }] as const,
  get: (instanceId: string, bookId: number) =>
    [...booksQueryKeys.all(instanceId), 'get', bookId] as const,
  search: (instanceId: string, query: string) =>
    [...booksQueryKeys.all(instanceId), 'search', query] as const,
  getLatestDbPlaybackPosition: (instanceId: string, bookId: number) =>
    [...booksQueryKeys.all(instanceId), 'getLatestDbPlaybackPosition', bookId] as const,
  getPlaybackHistory: (instanceId: string, bookId: number) =>
    [...booksQueryKeys.all(instanceId), 'getPlaybackHistory', bookId] as const,
  getByFileIds: (instanceId: string, fileIds: string[]) =>
    [...booksQueryKeys.all(instanceId), 'getByFileIds', { fileIds }] as const,
};

const list = {
  useQuery: () => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: booksQueryKeys.list(instanceId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookAuthor')
              .where('bookAuthor.deletedAt', 'is', null)
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
              .select((eb) => [
                'audiobookFile.bookId as bookId',
                eb.fn.sum<number | null>('audiobookFile.durationMs').as('totalDurationMs'),
              ])
              .groupBy('audiobookFile.bookId')
          )
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .select(['book.id', 'book.title', 'book.cover', 'book.coverThumbhash'])
          .orderBy('book.updatedAt', 'desc')
          .leftJoin('authorsArray', (join) => join.onRef('authorsArray.bookId', '=', 'book.id'))
          .leftJoin('audiobookFileDurations', (join) =>
            join.onRef('audiobookFileDurations.bookId', '=', 'book.id')
          )
          .leftJoin('latestPlaybackPosition', (join) =>
            join.onRef('latestPlaybackPosition.bookId', '=', 'book.id')
          )
          .select((eb) => [
            'authorsArray.authors',
            eb.fn
              .coalesce('audiobookFileDurations.totalDurationMs', eb.lit(0))
              .as('totalDurationMs'),
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
          authors: (result.authors ? JSON.parse(result.authors) : []) as Pick<
            Selectable<InstanceDatabase['author']>,
            'id' | 'name'
          >[],
        }));
      },
    });
  },
  useInfinteQuery: (pageSize: number = 10) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useInfiniteReactQuery({
      queryKey: booksQueryKeys.listInfinite(instanceId, pageSize),
      networkMode: 'always',
      initialPageParam: null as { lastUpdatedAt: number; lastId: number } | null,
      queryFn: async ({ pageParam }) => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .select(['book.id', 'book.title', 'book.cover', 'book.coverThumbhash', 'book.updatedAt'])
          .orderBy('book.updatedAt', 'desc')
          .orderBy('book.id', 'desc')
          .limit(pageSize + 1)
          .select((eb) => [
            eb
              .selectFrom('bookAuthor')
              .innerJoin('author', (join) =>
                join
                  .onRef('author.id', '=', 'bookAuthor.authorId')
                  .on('author.deletedAt', 'is', null)
              )
              .whereRef('bookAuthor.bookId', '=', 'book.id')
              .where('bookAuthor.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'author.id',
                      eb.val('name'),
                      'author.name',
                    ]),
                  ])
                  .as('authors')
              )
              .as('authors'),
            eb
              .selectFrom('latestPlaybackPosition')
              .whereRef('latestPlaybackPosition.bookId', '=', 'book.id')
              .select((eb) =>
                eb
                  .fn<string>('json_object', [
                    eb.val('positionMs'),
                    'latestPlaybackPosition.positionMs',
                    eb.val('eventTimestampMs'),
                    'latestPlaybackPosition.eventTimestampMs',
                  ])
                  .as('playbackPosition')
              )
              .as('playbackPosition'),
          ]);

        if (pageParam) {
          query = query.where((eb) =>
            eb.or([
              eb('book.updatedAt', '<', pageParam.lastUpdatedAt),
              eb.and([
                eb('book.updatedAt', '=', pageParam.lastUpdatedAt),
                eb('book.id', '<', pageParam.lastId),
              ]),
            ])
          );
        }

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const results = await query.execute();

        const hasNextPage = results.length > pageSize;

        if (hasNextPage) {
          results.length -= 1;
        }

        return {
          items: results.map((result) => ({
            ...result,
            playbackPosition: result.playbackPosition
              ? (JSON.parse(result.playbackPosition) as {
                  positionMs: number;
                  eventTimestampMs: number;
                })
              : { positionMs: 0, eventTimestampMs: 0 },
            authors: (result.authors ? JSON.parse(result.authors) : []) as Pick<
              Selectable<InstanceDatabase['author']>,
              'id' | 'name'
            >[],
          })),
          nextCursor: hasNextPage
            ? {
                lastUpdatedAt: results[results.length - 1].updatedAt,
                lastId: results[results.length - 1].id,
              }
            : null,
        };
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });
  },
};

const get = {
  useQuery: (bookId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: booksQueryKeys.get(instanceId, bookId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('book')
          .where('book.id', '=', bookId)
          .where('book.deletedAt', 'is', null)
          .select([
            'book.id',
            'book.title',
            'book.subtitle',
            'book.cover',
            'book.coverThumbhash',
            'book.summary',
          ])
          .select((eb) => [
            eb
              .selectFrom('bookAuthor')
              .innerJoin('author', (join) =>
                join
                  .onRef('author.id', '=', 'bookAuthor.authorId')
                  .on('author.deletedAt', 'is', null)
              )
              .where('bookAuthor.bookId', '=', bookId)
              .where('bookAuthor.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'author.id',
                      eb.val('name'),
                      'author.name',
                      eb.val('avatar'),
                      'author.avatar',
                      eb.val('avatarThumbhash'),
                      'author.avatarThumbhash',
                    ]),
                  ])
                  .as('authors')
              )
              .as('authors'),
            eb
              .selectFrom('bookSeries')
              .innerJoin('series', (join) =>
                join
                  .onRef('series.id', '=', 'bookSeries.seriesId')
                  .on('series.deletedAt', 'is', null)
              )
              .where('bookSeries.bookId', '=', bookId)
              .where('bookSeries.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'series.id',
                      eb.val('sort'),
                      'bookSeries.sort',
                      eb.val('label'),
                      'bookSeries.label',
                      eb.val('name'),
                      'series.name',
                    ]),
                  ])
                  .as('series')
              )
              .as('series'),
            eb
              .selectFrom('bookContributor')
              .where('bookContributor.bookId', '=', bookId)
              .where('bookContributor.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'bookContributor.id',
                      eb.val('role'),
                      'bookContributor.role',
                      eb.val('name'),
                      'bookContributor.name',
                    ]),
                  ])
                  .as('contributors')
              )
              .as('contributors'),
            eb
              .selectFrom('audiobookChapter')
              .where('audiobookChapter.bookId', '=', bookId)
              .where('audiobookChapter.source', '=', 'audible')
              .where('audiobookChapter.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'audiobookChapter.id',
                      eb.val('parentId'),
                      'audiobookChapter.parentId',
                      eb.val('bookId'),
                      'audiobookChapter.bookId',
                      eb.val('title'),
                      'audiobookChapter.title',
                      eb.val('durationMs'),
                      'audiobookChapter.durationMs',
                      eb.val('startOffsetMs'),
                      'audiobookChapter.startOffsetMs',
                    ]),
                  ])
                  .orderBy('audiobookChapter.startOffsetMs', 'asc')
                  .as('audibleChapters')
              )
              .as('audibleChapters'),
            eb
              .selectFrom('audiobookChapter')
              .where('audiobookChapter.bookId', '=', bookId)
              .where('audiobookChapter.source', '=', 'file')
              .where('audiobookChapter.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'audiobookChapter.id',
                      eb.val('bookId'),
                      'audiobookChapter.bookId',
                      eb.val('fileId'),
                      'audiobookChapter.fileId',
                      eb.val('title'),
                      'audiobookChapter.title',
                      eb.val('durationMs'),
                      'audiobookChapter.durationMs',
                      eb.val('startOffsetMs'),
                      'audiobookChapter.startOffsetMs',
                    ]),
                  ])
                  .orderBy('audiobookChapter.startOffsetMs', 'asc')
                  .as('fileChapters')
              )
              .as('fileChapters'),
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.bookId', '=', bookId)
              .where('audiobookFile.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'audiobookFile.id',
                      eb.val('durationMs'),
                      'audiobookFile.durationMs',
                      eb.val('disc'),
                      'audiobookFile.disc',
                      eb.val('track'),
                      'audiobookFile.track',
                      eb.val('path'),
                      'audiobookFile.path',
                    ]),
                  ])
                  .orderBy('audiobookFile.disc', 'asc')
                  .orderBy('audiobookFile.track', 'asc')
                  .as('files')
              )
              .as('files'),
            eb
              .selectFrom('latestPlaybackPosition')
              .where('latestPlaybackPosition.bookId', '=', bookId)
              .select((eb) =>
                eb
                  .fn<string>('json_object', [
                    eb.val('positionMs'),
                    'latestPlaybackPosition.positionMs',
                    eb.val('eventTimestampMs'),
                    'latestPlaybackPosition.eventTimestampMs',
                  ])
                  .as('playbackPosition')
              )
              .as('playbackPosition'),
          ]);

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const result = await query.executeTakeFirstOrThrow();

        return {
          id: result.id,
          title: result.title,
          subtitle: result.subtitle,
          cover: result.cover,
          coverThumbhash: result.coverThumbhash,
          summary: result.summary,
          playbackPosition: result.playbackPosition
            ? (JSON.parse(result.playbackPosition) as {
                positionMs: number;
                eventTimestampMs: number;
              })
            : { positionMs: 0, eventTimestampMs: 0 },
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
                  Extract<Selectable<InstanceDatabase['audiobookChapter']>, { source: 'audible' }>,
                  'id' | 'parentId' | 'bookId' | 'title' | 'durationMs' | 'startOffsetMs'
                >[])
              : [],
            file: result.fileChapters
              ? (JSON.parse(result.fileChapters) as Pick<
                  Extract<Selectable<InstanceDatabase['audiobookChapter']>, { source: 'file' }>,
                  'id' | 'bookId' | 'fileId' | 'title' | 'durationMs' | 'startOffsetMs'
                >[])
              : [],
          },
          files: result.files
            ? (JSON.parse(result.files) as Pick<
                Selectable<InstanceDatabase['audiobookFile']>,
                'id' | 'durationMs' | 'disc' | 'track' | 'path'
              >[])
            : [],
        };
      },
    });
  },
};

const search = {
  useQuery: (searchQuery: string) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: booksQueryKeys.search(instanceId, searchQuery),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .select(['book.id', 'book.title', 'book.cover', 'book.coverThumbhash'])
          .select((eb) => [
            eb
              .selectFrom('bookAuthor')
              .innerJoin('author', (join) =>
                join
                  .onRef('author.id', '=', 'bookAuthor.authorId')
                  .on('author.deletedAt', 'is', null)
              )
              .whereRef('bookAuthor.bookId', '=', 'book.id')
              .where('bookAuthor.deletedAt', 'is', null)
              .select((eb) =>
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'author.id',
                      eb.val('name'),
                      'author.name',
                    ]),
                  ])
                  .as('authors')
              )
              .as('authors'),
            eb
              .selectFrom('audiobookFile')
              .whereRef('audiobookFile.bookId', '=', 'book.id')
              .where('audiobookFile.deletedAt', 'is', null)
              .select((eb) => eb.fn.sum<number>('audiobookFile.durationMs').as('totalDurationMs'))
              .as('totalDurationMs'),
            eb
              .selectFrom('latestPlaybackPosition')
              .whereRef('latestPlaybackPosition.bookId', '=', 'book.id')
              .select((eb) =>
                eb
                  .fn<string>('json_object', [
                    eb.val('positionMs'),
                    'latestPlaybackPosition.positionMs',
                    eb.val('eventTimestampMs'),
                    'latestPlaybackPosition.eventTimestampMs',
                  ])
                  .as('playbackPosition')
              )
              .as('playbackPosition'),
          ]);

        if (searchQuery.length > 0) {
          query = query
            .innerJoin('bookFTS', (join) =>
              join.on('bookFTS.title', 'match', searchQuery).onRef('book.id', '=', 'bookFTS.rowid')
            )
            // the better the match, the smaller the value
            .orderBy('bookFTS.rank', 'asc');
        }

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        query = query.orderBy('book.updatedAt', 'desc');

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          totalDurationMs: result.totalDurationMs ?? 0,
          playbackPosition: result.playbackPosition
            ? (JSON.parse(result.playbackPosition) as {
                positionMs: number;
                eventTimestampMs: number;
              })
            : { positionMs: 0, eventTimestampMs: 0 },
          authors: (result.authors ? JSON.parse(result.authors) : []) as Pick<
            Selectable<InstanceDatabase['author']>,
            'id' | 'name'
          >[],
        }));
      },
    });
  },
};

const getPlaybackHistory = {
  useQuery: (bookId: number) => {
    const localPlaybackHistory = usePlaybackHistoryContext();
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    const dbPlaybackHistory = useReactQuery({
      queryKey: booksQueryKeys.getPlaybackHistory(instanceId, bookId),
      networkMode: 'always',
      queryFn: async () =>
        instanceDb
          .selectFrom('playbackHistory')
          .where('bookId', '=', bookId)
          .where('deletedAt', 'is', null)
          .select(['id', 'type', 'bookId', 'positionMs', 'eventTimestampMs'])
          .orderBy('eventTimestampMs', 'desc')
          // we order by type because often seek start and seek end have the same eventTimestampMs
          .orderBy('type', 'desc')
          .execute(),
    });

    const [mergedPlaybackHistory, setMergedPlaybackHistory] = useState<
      {
        source: 'local' | 'db';
        id: number;
        type: number;
        bookId: number;
        positionMs: number;
        eventTimestampMs: number;
      }[]
    >([]);

    useEffect(() => {
      if (localPlaybackHistory.instanceId === instanceId) {
        const localBookPlaybackHistory = localPlaybackHistory.events.filter(
          (event) => event.bookId === bookId
        );
        setMergedPlaybackHistory(
          [
            ...localBookPlaybackHistory.map((event) => ({ ...event, source: 'local' as const })),
            ...(dbPlaybackHistory.data?.map((event) => ({ ...event, source: 'db' as const })) ??
              []),
          ]
            .flat()
            .sort((a, b) => b.eventTimestampMs - a.eventTimestampMs || b.type - a.type)
        );
      } else {
        setMergedPlaybackHistory(
          dbPlaybackHistory.data?.map((event) => ({ ...event, source: 'db' as const })) ?? []
        );
      }
    }, [instanceId, bookId, dbPlaybackHistory.data, localPlaybackHistory]);

    return { ...dbPlaybackHistory, mergedPlaybackHistory };
  },
};

const getByFileIds = {
  useQuery: (fileIds: string[]) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: booksQueryKeys.getByFileIds(instanceId, fileIds),
      networkMode: 'always',
      queryFn: async () => {
        if (fileIds.length === 0) {
          return [];
        }

        let query = instanceDb
          .with('downloadedAudiobookFiles', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .select((eb) => [
                'audiobookFile.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [eb.val('id'), 'audiobookFile.id']),
                  ])
                  .as('files'),
              ])
              .where(
                'audiobookFile.id',
                'in',
                // @ts-expect-error: Things are fine at runtime even if I pass `fileIds` as `string[]`
                fileIds
              )
              .groupBy('audiobookFile.bookId')
          )
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookAuthor')
              // we don't filter by deletedAt or role on purpose to allow the UI to show a cleanup button
              .innerJoin('downloadedAudiobookFiles', (join) =>
                join.onRef('bookAuthor.bookId', '=', 'downloadedAudiobookFiles.bookId')
              )
              .innerJoin('author', (join) => join.onRef('bookAuthor.authorId', '=', 'author.id'))
              .select((eb) => [
                'downloadedAudiobookFiles.bookId',
                'downloadedAudiobookFiles.files',
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
          .selectFrom('book')
          .select(['book.id', 'book.title', 'book.cover', 'book.coverThumbhash'])
          .innerJoin('authorsArray', (join) => join.onRef('book.id', '=', 'authorsArray.bookId'))
          .select(['authorsArray.authors', 'authorsArray.files']);

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          authors: result.authors
            ? (JSON.parse(result.authors) as Pick<
                Selectable<InstanceDatabase['author']>,
                'id' | 'name' | 'avatar' | 'avatarThumbhash' | 'deletedAt'
              >[])
            : [],
          files: result.files
            ? (JSON.parse(result.files) as Pick<
                Selectable<InstanceDatabase['audiobookFile']>,
                'id'
              >[])
            : [],
        }));
      },
    });
  },
};

export { list, list as listRecentlyAdded, get, search, getPlaybackHistory, getByFileIds };
