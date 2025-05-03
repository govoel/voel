import { authModalStore } from './auth-modal';
import { Spinner } from './spinner';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Text } from './ui/text';
import { Large } from './ui/typography';
import type { AppRouter } from '@/router/root';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import {
  type TRPCOptionsProxy,
  type TRPCSubscriptionResult,
  useSubscription,
} from '@trpc/tanstack-react-query';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { type Insertable, Kysely } from 'kysely';
import { type ReactNode, createContext, use, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { BottomSheet } from '~/components/ui/bottom-sheet';

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
  const { data, isPending } = useAuthSession(authClient);

  if (!data) {
    return (
      <View className="relative">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
          <LogIn className="text-foreground" />
        </Button>
        {isPending && (
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

  return <LoggedInUserAvatar user={{ name: data.user.name, image: data.user.image }} />;
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
          audiobookChapter:
            (
              await instanceDb
                .selectFrom('audiobookChapter')
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
          ebookFile:
            (
              await instanceDb
                .selectFrom('ebookFile')
                .select((eb) => eb.fn.max('updatedAt').as('maxUpdatedAt'))
                .executeTakeFirstOrThrow()
            ).maxUpdatedAt ?? 0,
        },
        {
          enabled: true,
          onData: async (data) => {
            try {
              if (data.type === 'history') {
                if (data.payload.table === 'library') {
                  await upsertLibrary(
                    instanceDb,
                    ensureExact<
                      Insertable<LibraryTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'author') {
                  await upsertAuthor(
                    instanceDb,
                    ensureExact<Insertable<AuthorTable<'realtime'>>[], (typeof data.payload.row)[]>(
                      [data.payload.row]
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'series') {
                  await upsertSeries(
                    instanceDb,
                    ensureExact<Insertable<SeriesTable<'realtime'>>[], (typeof data.payload.row)[]>(
                      [data.payload.row]
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'book') {
                  await upsertBook(
                    instanceDb,
                    ensureExact<Insertable<BookTable<'realtime'>>[], (typeof data.payload.row)[]>([
                      data.payload.row,
                    ])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'bookAuthor') {
                  await upsertBookAuthor(
                    instanceDb,
                    ensureExact<
                      Insertable<BookAuthorTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'bookSeries') {
                  await upsertBookSeries(
                    instanceDb,
                    ensureExact<
                      Insertable<BookSeriesTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'bookContributor') {
                  await upsertBookContributor(
                    instanceDb,
                    ensureExact<
                      Insertable<BookContributorTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'audiobookChapter') {
                  await upsertAudiobookChapter(
                    instanceDb,
                    ensureExact<
                      Insertable<AudiobookChapterTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'audiobookFile') {
                  await upsertAudiobookFile(
                    instanceDb,
                    ensureExact<
                      Insertable<AudiobookFileTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                } else if (data.payload.table === 'ebookFile') {
                  await upsertEBookFile(
                    instanceDb,
                    ensureExact<
                      Insertable<EBookFileTable<'realtime'>>[],
                      (typeof data.payload.row)[]
                    >([data.payload.row])
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                }
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
                } else if (data.payload.table === 'audiobookChapter') {
                  await upsertAudiobookChapter(
                    instanceDb,
                    ensureExact<
                      Insertable<AudiobookChapterTable<'realtime'>>[],
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
                } else if (data.payload.table === 'ebookFile') {
                  await upsertEBookFile(
                    instanceDb,
                    ensureExact<Insertable<EBookFileTable<'realtime'>>[], typeof data.payload.rows>(
                      data.payload.rows
                    )
                  );
                  queryClient.invalidateQueries({ queryKey: ['instance'] });
                }
              }
            } catch (error) {
              toast.error(`Error processing ${data.type} data for ${data.payload.table}`, {
                description: error instanceof Error ? error.message : 'Unknown error',
              });
            }
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
      data: TRPCSubscriptionResult<
        AsyncIterableYield<inferRouterOutputs<AppRouter>['v1']['sync']['subscribe']>,
        TRPCClientErrorLike<AppRouter>
      >;
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

  return <SubscriptionContext value={{ isPending, data }}>{children}</SubscriptionContext>;
};

const LoggedInUserAvatar = ({
  user,
}: {
  user: { name: string; image: string | null | undefined };
}) => {
  const userInitials = getInitials(user.name ?? '');

  const subscription = useSubscriptionContext();

  useEffect(() => {
    if (!subscription.isPending && subscription.data.status === 'error') {
      toast.error('Error while subscribing to realtime changes', {
        description: subscription.data.error?.message ?? 'Unknown error',
      });
    }
  }, [subscription]);

  return (
    <View
      className={cn(
        'relative border-2 rounded-full',
        subscription.isPending
          ? 'border-foreground'
          : subscription.data.status === 'idle' || subscription.data.status === 'error'
            ? 'border-red-500'
            : subscription.data.status === 'pending'
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
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

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
    <BottomSheet ref={bottomSheetModalRef}>
      <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
        <Large className="pb-2">Switch account</Large>
        <AccountList />
        <Button onPress={() => authModalStore.trigger.presentAuthModal()}>
          <Text>Add account</Text>
        </Button>
      </View>
    </BottomSheet>
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
                key={account.instanceID}
                instanceID={account.instanceID}
                instanceURL={account.instanceURL}
                instanceUserID={account.userID}
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
  instanceID,
  instanceURL,
  instanceUserID,
  instanceUsername,
  instanceName,
  instanceImage,
}: {
  className?: string;
  instanceID: number;
  instanceURL: string;
  instanceUserID: string;
  instanceUsername: string;
  instanceEmail: string;
  instanceName: string;
  instanceImage?: string;
}) => {
  const authClient = useMemo(
    () => createInstanceAuthClient(instanceID.toString(), instanceURL),
    [instanceID, instanceURL]
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
          instanceID: instanceID.toString(),
          instanceURL,
          instanceUserID,
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
