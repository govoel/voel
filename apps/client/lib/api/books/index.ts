import {
  useInfiniteQuery as useInfiniteReactQuery,
  useQuery as useReactQuery,
} from '@tanstack/react-query';
import type { Selectable } from 'kysely';
import { useEffect, useState } from 'react';

import { usePlaybackHistoryContext } from '~/components/playback-history-provider';

import { mainDb } from '~/db/client';
import type { InstanceDatabase } from '~/db/schema/instance';

import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';

export const booksQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'books'] as const,
  list: (instanceId: string) => [...booksQueryKeys.all(instanceId), 'list'] as const,
  listInfinite: (instanceId: string, pageSize: number) =>
    [...booksQueryKeys.all(instanceId), 'listInfinite', { pageSize }] as const,
  get: (instanceId: string, bookId: number) =>
    [...booksQueryKeys.all(instanceId), 'get', bookId] as const,
  search: (instanceId: string, query: string) =>
    [...booksQueryKeys.all(instanceId), 'search', query] as const,
  getPlaybackPosition: (instanceId: string, bookId: number) =>
    [...booksQueryKeys.all(instanceId), 'getPlaybackPosition', bookId] as const,
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
          .leftJoin('playbackHistoryBooks', (join) =>
            join.onRef('playbackHistoryBooks.bookId', '=', 'book.id')
          )
          .groupBy('book.id')
          .orderBy('book.updatedAt', 'desc')
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
  useInfinteQuery: (pageSize: number = 10) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useInfiniteReactQuery({
      queryKey: booksQueryKeys.listInfinite(instanceId, pageSize),
      networkMode: 'always',
      initialPageParam: null as { lastUpdatedAt: number; lastId: number } | null,
      queryFn: async ({ pageParam }) => {
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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
          .orderBy('book.updatedAt', 'desc')
          .orderBy('book.id', 'desc')
          .limit(pageSize + 1)
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
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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
                  eb.ref('author.avatarThumbhash'),
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
            eb.fn
              .agg<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('audiobookChapter.id'),
                  eb.val('parentId'),
                  eb.ref('audiobookChapter.parentId'),
                  eb.val('bookId'),
                  eb.ref('audiobookChapter.bookId'),
                  eb.val('title'),
                  eb.ref('audiobookChapter.title'),
                  eb.val('durationMs'),
                  eb.ref('audiobookChapter.durationMs'),
                  eb.val('startOffsetMs'),
                  eb.ref('audiobookChapter.startOffsetMs'),
                ]),
              ])
              .orderBy('audiobookChapter.startOffsetMs', 'asc')
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
            eb.fn
              .agg<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('audiobookChapter.id'),
                  eb.val('bookId'),
                  eb.ref('audiobookChapter.bookId'),
                  eb.val('fileId'),
                  eb.ref('audiobookChapter.fileId'),
                  eb.val('title'),
                  eb.ref('audiobookChapter.title'),
                  eb.val('durationMs'),
                  eb.ref('audiobookChapter.durationMs'),
                  eb.val('startOffsetMs'),
                  eb.ref('audiobookChapter.startOffsetMs'),
                ]),
              ])
              .orderBy('audiobookChapter.startOffsetMs', 'asc')
              .as('fileChapters'),
          ])
          .groupBy('audiobookChapter.bookId')
          .as('fileChapterData');

        let filesSubquery = instanceDb
          .selectFrom('audiobookFile')
          .where('audiobookFile.deletedAt', 'is', null)
          .where('audiobookFile.bookId', '=', bookId)
          .select((eb) => [
            'audiobookFile.bookId as bookId',
            eb.fn
              .agg<string>('json_group_array', [
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
                ]),
              ])
              .orderBy('audiobookFile.disc', 'asc')
              .orderBy('audiobookFile.track', 'asc')
              .as('files'),
          ])
          .groupBy('audiobookFile.bookId')
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

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

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
                'id' | 'durationMs' | 'disc' | 'track' | 'libraryId' | 'path'
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
          .leftJoin('playbackHistoryBooks', (join) =>
            join.onRef('playbackHistoryBooks.bookId', '=', 'book.id')
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
            eb.fn
              .coalesce(eb.fn.sum<number | null>('audiobookFile.durationMs'), eb.lit(0))
              .as('totalDurationMs'),
            eb.fn.coalesce('playbackHistoryBooks.positionMs', eb.lit(0)).as('playbackPositionMs'),
            eb.fn
              .coalesce('playbackHistoryBooks.updatedAt', eb.lit(0))
              .as('playbackPositionUpdatedAt'),
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
          authors: (result.authors ? JSON.parse(result.authors) : []) as Pick<
            Selectable<InstanceDatabase['author']>,
            'id' | 'name'
          >[],
        }));
      },
    });
  },
};

const getPlaybackPosition = {
  useQuery: (bookId: number) => {
    const playbackHistory = usePlaybackHistoryContext();
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    const { data } = useReactQuery({
      queryKey: booksQueryKeys.getPlaybackPosition(instanceId, bookId),
      networkMode: 'always',
      queryFn: async () => {
        let query = await instanceDb
          .selectFrom('playbackHistory')
          .where('bookId', '=', bookId)
          .where('deletedAt', 'is', null)
          .select(['positionMs', 'eventTimestampMs'])
          .orderBy('eventTimestampMs', 'desc')
          // we order by type because often seek start and seek end have the same eventTimestampMs
          .orderBy('type', 'desc')
          .limit(1)
          .executeTakeFirst();

        return {
          positionMs: query?.positionMs ?? 0,
          eventTimestampMs: query?.eventTimestampMs ?? 0,
        };
      },
    });

    const [currentPlaybackPosition, setCurrentPlaybackPosition] = useState<number>(0);

    useEffect(() => {
      if (playbackHistory.instanceId === instanceId) {
        const bookPlaybackHistory = playbackHistory.events.filter(
          (event) => event.bookId === bookId
        );
        if (data) {
          if (
            bookPlaybackHistory.length > 0 &&
            bookPlaybackHistory[0].eventTimestampMs > data.eventTimestampMs
          ) {
            setCurrentPlaybackPosition(Math.max(bookPlaybackHistory[0].positionMs, 0));
          } else {
            setCurrentPlaybackPosition(Math.max(data.positionMs, 0));
          }
        } else {
          setCurrentPlaybackPosition(
            Math.max(
              bookPlaybackHistory.length > 0 ? bookPlaybackHistory[0].positionMs : -Infinity,
              0
            )
          );
        }
      } else {
        setCurrentPlaybackPosition(Math.max(data?.positionMs ?? 0, 0));
      }
    }, [instanceId, bookId, data, playbackHistory]);

    return currentPlaybackPosition;
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
        // we don't filter by deletedAt or role on purpose to allow the UI to show a cleanup button
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
            eb.fn
              .agg<string>('json_group_array', [
                eb.fn<string>('json_object', [eb.val('id'), eb.ref('audiobookFile.id')]),
              ])
              .orderBy('audiobookFile.disc', 'asc')
              .orderBy('audiobookFile.track', 'asc')
              .as('files'),
          ])
          .where('audiobookFile.id', 'in', fileIds)
          .groupBy('audiobookFile.bookId')
          .as('fileData');

        let query = instanceDb
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
          .select(['authorData.authors', 'fileData.files']);

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

export {
  list,
  list as listRecentlyAdded,
  get,
  search,
  getPlaybackPosition,
  getPlaybackHistory,
  getByFileIds,
};
