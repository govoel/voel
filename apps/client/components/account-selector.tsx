import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { type TRPCClientErrorLike } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import {
  type TRPCOptionsProxy,
  type TRPCSubscriptionResult,
  useSubscription,
} from '@trpc/tanstack-react-query';
import type { AppRouter } from '@voel/server/src/router/root';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { type Insertable, Kysely, Transaction } from 'kysely';
import { type ReactNode, createContext, use, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { authModalStore } from '~/components/auth-modal';
import { Spinner } from '~/components/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import type {
  AudiobookChapterTable,
  AudiobookFileTable,
  AuthorTable,
  BookAuthorTable,
  BookContributorTable,
  BookSeriesTable,
  BookTable,
  EBookFileTable,
  InstanceDatabase,
  LibraryTable,
  PlaybackHistoryTable,
  SeriesTable,
} from '~/db/schema/instance';

import api from '~/lib/api';
import { LogIn } from '~/lib/icons/LogIn';
import { createInstanceAuthClient, instanceStore, useAuthSession } from '~/lib/stores/instance';
import { cn, getInitials } from '~/lib/utils';

export const accountSelectorModalStore = createStore({
  context: {
    present: 0,
    dismiss: 0,
  },
  on: {
    presentAccountSelectorModal: (context) => ({
      present: context.present + 1,
      dismiss: context.dismiss,
    }),
    dismissAccountSelectorModal: (context) => ({
      dismiss: context.dismiss + 1,
      present: context.present,
    }),
  },
});

export const AccountSelectorAvatar = () => {
  const authClient = useSelector(instanceStore, (state) => state.context.authInstance);
  const instanceId = useSelector(instanceStore, (state) => state.context.instanceId);
  const { data: localAccountData } = api.accounts.get.useQuery(instanceId ?? '0');
  const { data: authSessionData, isPending: authSessionIsPending } = useAuthSession(authClient);

  if (!localAccountData) {
    return (
      <View className="relative">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
          <LogIn className="text-foreground" />
        </Button>
        {authSessionIsPending && (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
            className="absolute inset-0 flex items-center justify-center w-full h-full bg-muted/80 active:bg-muted/90 rounded-md">
            <Spinner size={3} />
          </Button>
        )}
      </View>
    );
  }

  if (!authSessionData) {
    return (
      <View className="relative">
        <LoggedInUserAvatar user={{ name: localAccountData.name, image: localAccountData.image }} />
        {authSessionIsPending && (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
            className="absolute inset-0 flex items-center justify-center w-full h-full bg-muted/80 active:bg-muted/90 rounded-md">
            <Spinner size={3} />
          </Button>
        )}
      </View>
    );
  }

  return (
    <LoggedInUserAvatar
      user={{ name: authSessionData.user.name, image: authSessionData.user.image }}
    />
  );
};

const upsertLibrary = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<LibraryTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('library')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        name: (eb) => eb.ref('excluded.name'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertAuthor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<AuthorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('author')
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

const upsertSeries = (
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

const upsertBook = (
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

const upsertBookAuthor = (
  db: Kysely<InstanceDatabase<'regular'>>,
  rows: Insertable<BookAuthorTable<'realtime'>>[]
) =>
  (db as unknown as Kysely<InstanceDatabase<'realtime'>>)
    .insertInto('bookAuthor')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['id']).doUpdateSet({
        bookId: (eb) => eb.ref('excluded.bookId'),
        authorId: (eb) => eb.ref('excluded.authorId'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertBookSeries = (
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
        label: (eb) => eb.ref('excluded.label'),
        sort: (eb) => eb.ref('excluded.sort'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertBookContributor = (
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

const upsertAudiobookFile = (
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
        durationMs: (eb) => eb.ref('excluded.durationMs'),
        disc: (eb) => eb.ref('excluded.disc'),
        track: (eb) => eb.ref('excluded.track'),
        createdAt: (eb) => eb.ref('excluded.createdAt'),
        updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        deletedAt: (eb) => eb.ref('excluded.deletedAt'),
      })
    )
    .execute();

const upsertAudiobookChapter = (
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

const upsertEBookFile = (
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

const upsertPlaybackHistory = (
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

const flushHistoryData = async (
  trx: Transaction<InstanceDatabase<'regular'>>,
  history: {
    rowCount: number;
    library: Insertable<LibraryTable<'realtime'>>[];
    author: Insertable<AuthorTable<'realtime'>>[];
    series: Insertable<SeriesTable<'realtime'>>[];
    book: Insertable<BookTable<'realtime'>>[];
    bookAuthor: Insertable<BookAuthorTable<'realtime'>>[];
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
  if (history.author.length > 0) {
    await upsertAuthor(trx, history.author);
  }
  if (history.series.length > 0) {
    await upsertSeries(trx, history.series);
  }
  if (history.book.length > 0) {
    await upsertBook(trx, history.book);
  }
  if (history.bookAuthor.length > 0) {
    await upsertBookAuthor(trx, history.bookAuthor);
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
  history.author = [];
  history.series = [];
  history.book = [];
  history.bookAuthor = [];
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

const ensureExact = <TKnown, TUnknown extends TKnown>(t: Exact<TKnown, TUnknown>) => t as TKnown;

const useSyncSubscriptionOptions = (
  apiInstance: TRPCOptionsProxy<AppRouter>,
  instanceDb: Kysely<InstanceDatabase>
) => {
  const [subscriptionOptions, setSubscriptionOptions] = useState<
    ReturnType<typeof apiInstance.v1.sync.subscribe.subscriptionOptions>
  >({
    enabled: false,
    subscribe: () => ({
      unsubscribe: () => {},
    }),
    trpc: { path: 'dummyWhileRealSubscriptionLoads' },
    queryKey: [['dummyWhileRealSubscriptionLoads']],
  });
  const [isPending, setIsPending] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let queue = Promise.resolve();

    const historyData = {
      rowCount: 0,
      library: [] as Insertable<LibraryTable<'realtime'>>[],
      author: [] as Insertable<AuthorTable<'realtime'>>[],
      series: [] as Insertable<SeriesTable<'realtime'>>[],
      book: [] as Insertable<BookTable<'realtime'>>[],
      bookAuthor: [] as Insertable<BookAuthorTable<'realtime'>>[],
      bookSeries: [] as Insertable<BookSeriesTable<'realtime'>>[],
      bookContributor: [] as Insertable<BookContributorTable<'realtime'>>[],
      audiobookFile: [] as Insertable<AudiobookFileTable<'realtime'>>[],
      audiobookChapter: [] as Insertable<AudiobookChapterTable<'realtime'>>[],
      ebookFile: [] as Insertable<EBookFileTable<'realtime'>>[],
      playbackHistory: [] as Insertable<PlaybackHistoryTable<'realtime'>>[],
    };

    const createSubscription = async () => {
      const subscriptionOptions = apiInstance.v1.sync.subscribe.subscriptionOptions(
        {
          library:
            (
              await instanceDb
                .selectFrom('library')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          author:
            (
              await instanceDb
                .selectFrom('author')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          series:
            (
              await instanceDb
                .selectFrom('series')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          book:
            (
              await instanceDb
                .selectFrom('book')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          bookAuthor:
            (
              await instanceDb
                .selectFrom('bookAuthor')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          bookSeries:
            (
              await instanceDb
                .selectFrom('bookSeries')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          bookContributor:
            (
              await instanceDb
                .selectFrom('bookContributor')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          audiobookFile:
            (
              await instanceDb
                .selectFrom('audiobookFile')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          audiobookChapter:
            (
              await instanceDb
                .selectFrom('audiobookChapter')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          ebookFile:
            (
              await instanceDb
                .selectFrom('ebookFile')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
          playbackHistory:
            (
              await instanceDb
                .selectFrom('playbackHistory')
                .select((eb) => eb.fn.max<number | null>('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
        },
        {
          enabled: true,
          onData: async (data) => {
            queue = queue.then(async () => {
              try {
                if (data.type === 'history') {
                  historyData.rowCount += 1;
                  if (data.payload.table === 'library') {
                    historyData.library.push(
                      ensureExact<Insertable<LibraryTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'author') {
                    historyData.author.push(
                      ensureExact<Insertable<AuthorTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'series') {
                    historyData.series.push(
                      ensureExact<Insertable<SeriesTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'book') {
                    historyData.book.push(
                      ensureExact<Insertable<BookTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'bookAuthor') {
                    historyData.bookAuthor.push(
                      ensureExact<Insertable<BookAuthorTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'bookSeries') {
                    historyData.bookSeries.push(
                      ensureExact<Insertable<BookSeriesTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'bookContributor') {
                    historyData.bookContributor.push(
                      ensureExact<
                        Insertable<BookContributorTable<'realtime'>>,
                        typeof data.payload.row
                      >(data.payload.row)
                    );
                  } else if (data.payload.table === 'audiobookFile') {
                    historyData.audiobookFile.push(
                      ensureExact<
                        Insertable<AudiobookFileTable<'realtime'>>,
                        typeof data.payload.row
                      >(data.payload.row)
                    );
                  } else if (data.payload.table === 'audiobookChapter') {
                    historyData.audiobookChapter.push(
                      ensureExact<
                        Insertable<AudiobookChapterTable<'realtime'>>,
                        typeof data.payload.row
                      >(data.payload.row)
                    );
                  } else if (data.payload.table === 'ebookFile') {
                    historyData.ebookFile.push(
                      ensureExact<Insertable<EBookFileTable<'realtime'>>, typeof data.payload.row>(
                        data.payload.row
                      )
                    );
                  } else if (data.payload.table === 'playbackHistory') {
                    historyData.playbackHistory.push(
                      ensureExact<
                        Insertable<PlaybackHistoryTable<'realtime'>>,
                        typeof data.payload.row
                      >(data.payload.row)
                    );
                  }

                  if (historyData.rowCount % 100 === 0) {
                    await instanceDb.transaction().execute(async (trx) => {
                      await flushHistoryData(trx, historyData);
                    });
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  }
                } else if (data.type === 'historyComplete' && historyData.rowCount > 0) {
                  await instanceDb.transaction().execute(async (trx) => {
                    await flushHistoryData(trx, historyData);
                  });
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.type === 'live') {
                  if (data.payload.table === 'library') {
                    await upsertLibrary(
                      instanceDb,
                      ensureExact<Insertable<LibraryTable<'realtime'>>[], typeof data.payload.rows>(
                        data.payload.rows
                      )
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'author') {
                    await upsertAuthor(
                      instanceDb,
                      ensureExact<Insertable<AuthorTable<'realtime'>>[], typeof data.payload.rows>(
                        data.payload.rows
                      )
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'series') {
                    await upsertSeries(
                      instanceDb,
                      ensureExact<Insertable<SeriesTable<'realtime'>>[], typeof data.payload.rows>(
                        data.payload.rows
                      )
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'book') {
                    await upsertBook(
                      instanceDb,
                      ensureExact<Insertable<BookTable<'realtime'>>[], typeof data.payload.rows>(
                        data.payload.rows
                      )
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'bookAuthor') {
                    await upsertBookAuthor(
                      instanceDb,
                      ensureExact<
                        Insertable<BookAuthorTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'bookSeries') {
                    await upsertBookSeries(
                      instanceDb,
                      ensureExact<
                        Insertable<BookSeriesTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'bookContributor') {
                    await upsertBookContributor(
                      instanceDb,
                      ensureExact<
                        Insertable<BookContributorTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'audiobookFile') {
                    await upsertAudiobookFile(
                      instanceDb,
                      ensureExact<
                        Insertable<AudiobookFileTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'audiobookChapter') {
                    await upsertAudiobookChapter(
                      instanceDb,
                      ensureExact<
                        Insertable<AudiobookChapterTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'ebookFile') {
                    await upsertEBookFile(
                      instanceDb,
                      ensureExact<
                        Insertable<EBookFileTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  } else if (data.payload.table === 'playbackHistory') {
                    await upsertPlaybackHistory(
                      instanceDb,
                      ensureExact<
                        Insertable<PlaybackHistoryTable<'realtime'>>[],
                        typeof data.payload.rows
                      >(data.payload.rows)
                    );
                    queryClient.invalidateQueries({ queryKey: ['instance'] });
                  }
                }
              } catch (error) {
                if (data.type === 'live') {
                  toast.error(`Error processing live data for ${data.payload.table}`, {
                    description: error instanceof Error ? error.message : 'Unknown error',
                  });
                } else {
                  toast.error(`Error processing history data`, {
                    description: error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              }
            });
          },
        }
      );
      setSubscriptionOptions(subscriptionOptions);
      setIsPending(false);
    };

    createSubscription();
  }, [apiInstance, instanceDb]);

  return { subscriptionOptions, isPending };
};

export type AsyncIterableYield<T> = T extends AsyncIterable<infer U> ? U : T;

const SubscriptionContext = createContext<
  | {
      isPending: false;
      status: TRPCSubscriptionResult<
        AsyncIterableYield<inferRouterOutputs<AppRouter>['v1']['sync']['subscribe']>,
        TRPCClientErrorLike<AppRouter>
      >['status'];
      error: TRPCSubscriptionResult<
        AsyncIterableYield<inferRouterOutputs<AppRouter>['v1']['sync']['subscribe']>,
        TRPCClientErrorLike<AppRouter>
      >['error'];
    }
  | { isPending: true }
>({ isPending: true });

export const useSubscriptionContext = () => {
  const context = use(SubscriptionContext);

  if (!context) {
    throw new Error('useSubscriptionContext must be used within a SubscriptionProvider');
  }

  return context;
};

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const apiInstance = useSelector(instanceStore, (state) => state.context.apiInstance);

  const { subscriptionOptions, isPending } = useSyncSubscriptionOptions(apiInstance, instanceDb);
  const data = useSubscription(subscriptionOptions);

  return (
    <SubscriptionContext value={{ isPending, status: data.status, error: data.error }}>
      {children}
    </SubscriptionContext>
  );
};

const LoggedInUserAvatar = ({
  user,
}: {
  user: { name: string; image: string | null | undefined };
}) => {
  const userInitials = getInitials(user.name ?? '');

  const subscription = useSubscriptionContext();

  useEffect(() => {
    if (!subscription.isPending && subscription.status === 'error') {
      toast.error('Error while subscribing to realtime changes', {
        description: subscription.error?.message ?? 'Unknown error',
      });
    }
  }, [subscription]);

  return (
    <View
      className={cn(
        'relative border-2 rounded-full',
        subscription.isPending
          ? 'border-foreground'
          : subscription.status === 'idle' || subscription.status === 'error'
            ? 'border-red-500'
            : subscription.status === 'pending'
              ? 'border-green-500'
              : 'border-foreground'
      )}>
      <Avatar
        className="rounded-full border-transparent border-2"
        alt={`${user.name}'s Avatar`}
        asChild>
        <Pressable onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
          <AvatarImage source={{ uri: user.image ?? undefined }} />
          <AvatarFallback>
            <Text>{userInitials}</Text>
          </AvatarFallback>
        </Pressable>
      </Avatar>
      {subscription.isPending && (
        <Button
          variant="ghost"
          size="icon"
          onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
          className="absolute rounded-full inset-0 flex items-center justify-center w-full h-full bg-muted/80 active:bg-muted/90">
          <Spinner size={3} />
        </Button>
      )}
    </View>
  );
};

export const AccountSelector = () => {
  const bottomSheetModalRef = useRef<BottomSheetModalType>(null);

  const presentModal = useSelector(accountSelectorModalStore, (s) => s.context.present);
  const dismissModal = useSelector(accountSelectorModalStore, (s) => s.context.dismiss);
  useEffect(() => {
    if (presentModal > 0) {
      bottomSheetModalRef.current?.present();
    }
  }, [presentModal]);
  useEffect(() => {
    if (dismissModal > 0) {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [dismissModal]);

  return (
    <BottomSheetModal ref={bottomSheetModalRef}>
      <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
        <Large className="pb-2">Switch account</Large>
        <AccountList />
        <Button onPress={() => authModalStore.trigger.presentAuthModal()}>
          <Text>Add account</Text>
        </Button>
      </View>
    </BottomSheetModal>
  );
};

const AccountList = () => {
  const accounts = api.accounts.list.useQuery();

  if (accounts.data) {
    return (
      <>
        {accounts.data.length === 0 ? (
          <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
            <Text className="text-center">No accounts found</Text>
          </View>
        ) : (
          <View className="mb-4 overflow-hidden rounded-md border border-foreground/15">
            {accounts.data.map((account, index) => (
              <Account
                className={index === accounts.data.length - 1 ? '' : 'border-b'}
                key={account.instanceId}
                instanceId={account.instanceId}
                instanceURL={account.instanceURL}
                instanceUserId={account.userId}
                instanceUsername={account.username}
                instanceEmail={account.email}
                instanceName={account.name}
                instanceImage={account.image}
              />
            ))}
          </View>
        )}
      </>
    );
  }

  if (accounts.error) {
    return (
      <View className="mb-4 rounded-md border border-foreground/15 p-4">
        <Text>Could not fetch list of accounts: {accounts.error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex items-center justify-center mb-4 rounded-md border border-foreground/15 p-12">
      <Spinner size={10} />
    </View>
  );
};

const Account = ({
  className,
  instanceId,
  instanceURL,
  instanceUserId,
  instanceUsername,
  instanceName,
  instanceImage,
}: {
  className?: string;
  instanceId: number;
  instanceURL: string;
  instanceUserId: string;
  instanceUsername: string;
  instanceEmail: string;
  instanceName: string;
  instanceImage?: string;
}) => {
  const authClient = useMemo(
    () => createInstanceAuthClient(instanceId.toString(), instanceURL),
    [instanceId, instanceURL]
  );
  const { data, isPending } = useAuthSession(authClient);

  return (
    <Button
      variant="ghost"
      className={cn(
        'flex-row gap-x-3 native:h-20 h-16 rounded-none border-foreground/15 bg-secondary/40',
        className
      )}
      onPress={() => {
        instanceStore.trigger.recreateAuthInstance({
          instanceId: instanceId.toString(),
          instanceURL,
          instanceUserId,
        });
        accountSelectorModalStore.trigger.dismissAccountSelectorModal();
      }}>
      <Avatar
        className="border border-foreground/15"
        alt={`${isPending ? instanceUsername : (data?.user.name ?? instanceUsername)}'s Avatar`}>
        <AvatarImage
          source={{
            uri: (isPending ? instanceImage : (data?.user.image ?? instanceImage)) ?? undefined,
          }}
        />
        <AvatarFallback>
          <Text>{getInitials(isPending ? instanceName : (data?.user.name ?? instanceName))}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1">
        <Text>{isPending ? instanceUsername : (data?.user.username ?? instanceUsername)}</Text>
        <Text className="text-muted-foreground">{instanceURL}</Text>
      </View>
    </Button>
  );
};
