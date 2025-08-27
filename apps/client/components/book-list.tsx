import { Button } from './ui/button';
import { Card, CardContent, CardFooter } from './ui/card';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Link } from 'expo-router';
import type { ComponentPropsWithoutRef, Key } from 'react';
import { Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { usePlaybackHistoryContext } from '~/components/playback-history-provider';
import { Spinner } from '~/components/spinner';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Badge } from '~/components/ui/badge';
import { Progress } from '~/components/ui/progress';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { useInstanceId } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

function PlaybackProgress({
  bookId,
  totalDurationMs,
  playbackPosition,
}: {
  bookId: number;
  totalDurationMs: number;
  playbackPosition: {
    positionMs: number;
    eventTimestampMs: number;
  };
}) {
  const localPlaybackHistory = usePlaybackHistoryContext();
  const instanceId = useInstanceId();

  if (instanceId !== '0' && localPlaybackHistory.instanceId === instanceId) {
    const bookEvents = localPlaybackHistory.events.filter((event) => event.bookId === bookId);

    if (bookEvents.length > 0) {
      const firstEvent = bookEvents[0];
      if (firstEvent.eventTimestampMs > (playbackPosition.eventTimestampMs ?? 0)) {
        return (
          <Progress
            className="h-2 rounded-b-md rounded-t-none"
            value={(firstEvent.positionMs / (totalDurationMs ?? 0)) * 100}
          />
        );
      }
    }
  }

  return (
    <Progress
      className="h-2 rounded-b-md rounded-t-none"
      value={(playbackPosition.positionMs / totalDurationMs) * 100}
    />
  );
}

export type BookListBook = {
  id: number;
  cover: string | null;
  coverThumbhash: string | null;
  title: string;
  label?: string;
  authors?: { name: string }[];
  contributors?: { name: string }[];
  totalDurationMs: number;
  playbackPosition: {
    positionMs: number;
    eventTimestampMs: number;
  };
};

type EnsureProp<K extends keyof ComponentPropsWithoutRef<typeof FlashList>> = K;
type BaseOmitted = EnsureProp<
  | 'data'
  | 'keyExtractor'
  | 'horizontal'
  | 'numColumns'
  | 'renderItem'
  | 'ListEmptyComponent'
  | 'onEndReached'
>;

function EmptyComponent({
  className,
  books,
  error,
  emptyListMessage,
  refetch,
}: {
  className?: string;
  books?: BookListBook[];
  error: Error | null;
  emptyListMessage: string;
  refetch: () => Promise<unknown>;
}) {
  if (error) {
    return (
      <Card className={cn('mb-4', className)}>
        <CardContent className="pt-4">
          <Large>Error loading books</Large>
          <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onPress={() => refetch()}>
            <Text>Retry</Text>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (books?.length === 0) {
    return (
      <View
        className={cn(
          'flex flex-col items-center justify-center px-8 py-16 border-dashed border-2 rounded-md border-muted mb-4 w-full',
          className
        )}>
        <Text className="text-center">{emptyListMessage}</Text>
      </View>
    );
  }

  return (
    <View className={cn('p-12 justify-center items-center', className)}>
      <Spinner size={15} />
    </View>
  );
}

export function BookList({
  books,
  ref,
  emptyListMessage = 'No books found',
  ...props
}: {
  books?: BookListBook[];
  ref?: React.RefObject<FlashListRef<BookListBook> | null>;
  emptyListMessage?: string;
} & (
  | ({
      direction: 'vertical';
      error: Error | null;
      refetch: () => Promise<unknown>;
    } & Omit<ComponentPropsWithoutRef<typeof FlashList>, BaseOmitted | EnsureProp<'className'>>)
  | ({
      direction: 'horizontal';
      error: Error | null;
      refetch: () => Promise<unknown>;
    } & Omit<
      ComponentPropsWithoutRef<typeof FlashList>,
      BaseOmitted | EnsureProp<'ListHeaderComponent' | 'ListEmptyComponent' | 'ListFooterComponent'>
    >)
) &
  (
    | {
        onEndReached: () => void;
        isFetchingNextPage: boolean;
        isFetchNextPageError: boolean;
      }
    | {
        onEndReached?: undefined;
      }
  )) {
  if (props.direction === 'horizontal' && books?.length === 0) {
    return (
      <EmptyComponent
        className={props.className}
        books={books}
        error={props.error}
        emptyListMessage={emptyListMessage}
        refetch={props.refetch}
      />
    );
  }

  return (
    <FlashList
      {...props}
      ref={ref}
      data={books}
      keyExtractor={(item) => item.id.toString()}
      horizontal={props.direction === 'horizontal'}
      numColumns={props.direction === 'vertical' ? 2 : undefined}
      renderItem={({ item, index }) => (
        <Link
          href={{
            pathname: '/book/[bookId]',
            params: { bookId: item.id },
          }}
          asChild
          push
          withAnchor>
          <Pressable
            className={cn(
              'h-full',
              props.direction === 'vertical' ? (index > 1 ? 'pt-4' : '') : 'w-48',
              props.direction === 'vertical'
                ? index % 2 === 0
                  ? 'pr-2'
                  : 'pl-2'
                : index === 0
                  ? 'mb-2'
                  : 'ml-4 mb-2'
            )}>
            {item.label ? (
              <View className="flex flex-row items-center pb-2">
                <Badge variant="outline">
                  <Text>{item.label}</Text>
                </Badge>
              </View>
            ) : null}
            <AspectRatio ratio={1 / 1}>
              {item.cover ? (
                <Image
                  className="w-full h-full rounded-t-md"
                  source={item.cover}
                  placeholder={{ thumbhash: item.coverThumbhash ?? undefined }}
                  recyclingKey={item.id.toString()}
                />
              ) : null}
            </AspectRatio>
            <PlaybackProgress
              bookId={item.id}
              totalDurationMs={item.totalDurationMs}
              playbackPosition={item.playbackPosition}
            />
            <View className="pt-2">
              <Large className="border-none" numberOfLines={1}>
                {item.title}
              </Large>
              <Muted numberOfLines={1}>
                {item.authors && item.authors.length > 0
                  ? item.authors.map((author) => author.name).join(', ')
                  : item.contributors && item.contributors.length > 0
                    ? item.contributors.map((contributor) => contributor.name).join(', ')
                    : 'No contributors available'}
              </Muted>
            </View>
          </Pressable>
        </Link>
      )}
      ListFooterComponent={
        <>
          {props.onEndReached ? (
            props.isFetchingNextPage ? (
              props.direction === 'vertical' ? (
                <View className="p-12 justify-center items-center">
                  <Spinner size={15} />
                </View>
              ) : (
                <View className="flex-1 ml-4 w-64 pb-12 flex justify-center items-center">
                  <Spinner size={15} />
                </View>
              )
            ) : props.isFetchNextPageError ? (
              props.direction === 'vertical' ? (
                <Card className="mt-4">
                  <CardContent className="pt-4">
                    <Large>Error loading more books</Large>
                    <Text className="text-muted-foreground">
                      {props.error?.message || 'Unknown error'}
                    </Text>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" onPress={() => props.onEndReached()}>
                      <Text>Retry</Text>
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card className="mb-2 ml-4 w-64 flex-1 flex justify-between">
                  <CardContent className="pt-4">
                    <Large>Error loading more books</Large>
                    <Text className="text-muted-foreground">
                      {props?.error?.message || 'Unknown error'}
                    </Text>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" onPress={() => props?.onEndReached?.()}>
                      <Text>Retry</Text>
                    </Button>
                  </CardFooter>
                </Card>
              )
            ) : null
          ) : null}
          {props.direction === 'vertical' ? props.ListFooterComponent : null}
        </>
      }
      ListEmptyComponent={
        props.direction === 'vertical' ? (
          <EmptyComponent
            books={books}
            error={props.error}
            emptyListMessage={emptyListMessage}
            refetch={props.refetch}
          />
        ) : null
      }
    />
  );
}
