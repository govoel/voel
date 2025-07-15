import { usePlaybackHistoryContext } from './playback-history-provider';
import { Progress } from './ui/progress';
import { Link } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Badge } from '~/components/ui/badge';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { useInstanceId } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

function PlaybackProgress({
  bookId,
  playbackPositionMs,
  playbackPositionUpdatedAt,
  totalDurationMs,
}: {
  bookId: number;
  playbackPositionMs: number | undefined;
  playbackPositionUpdatedAt: number | undefined;
  totalDurationMs: number | undefined;
}) {
  const localPlaybackHistory = usePlaybackHistoryContext();
  const instanceId = useInstanceId();

  if (instanceId !== '0' && localPlaybackHistory.instanceId === instanceId) {
    const bookEvents = localPlaybackHistory.events.filter((event) => event.bookId === bookId);

    if (bookEvents.length > 0) {
      const firstEvent = bookEvents[0];
      if (firstEvent.eventTimestampMs > (playbackPositionUpdatedAt ?? 0)) {
        return (
          <Progress
            className="h-2 rounded-b-md rounded-t-none"
            value={(firstEvent.positionMs / (totalDurationMs ?? 0)) * 100}
          />
        );
      }
    }
  }

  if (playbackPositionMs === undefined || totalDurationMs === undefined || totalDurationMs < 0)
    return null;

  return (
    <Progress
      className="h-2 rounded-b-md rounded-t-none"
      value={(playbackPositionMs / totalDurationMs) * 100}
    />
  );
}

type Book = {
  id: number;
  cover: string | null;
  coverThumbhash: string | null;
  title: string;
  label?: string;
  authors?: { name: string }[];
  contributors?: { name: string }[];
  totalDurationMs?: number;
  playbackPositionMs?: number;
  playbackPositionUpdatedAt?: number;
};

export function BookList({
  books,
  direction = 'vertical',
  className,
  ref,
  emptyListMessage = 'No books found',
}: {
  books: Book[];
  direction?: 'horizontal' | 'vertical';
  className?: string;
  ref?: React.RefObject<FlatList<Book> | null>;
  emptyListMessage?: string;
}) {
  if (books.length === 0) {
    return (
      <View className="flex flex-col items-center justify-center px-8 py-16 border-dashed border-2 rounded-md border-muted mb-4">
        <Text className="text-center">{emptyListMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={ref}
      className={className}
      data={books}
      keyExtractor={(item) => item.id.toString()}
      scrollEnabled={direction === 'horizontal'}
      horizontal={direction === 'horizontal'}
      numColumns={direction === 'vertical' ? 2 : undefined}
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
              direction === 'vertical' ? (index > 1 ? 'pt-4 w-1/2' : 'w-1/2') : 'w-48',
              direction === 'vertical'
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
                  className={cn(
                    'w-full h-full',
                    item.totalDurationMs && item.totalDurationMs > 0 ? 'rounded-t-md' : 'rounded-md'
                  )}
                  source={item.cover}
                  placeholder={{ thumbhash: item.coverThumbhash ?? undefined }}
                />
              ) : null}
            </AspectRatio>
            <PlaybackProgress
              bookId={item.id}
              playbackPositionMs={item.playbackPositionMs}
              playbackPositionUpdatedAt={item.playbackPositionUpdatedAt}
              totalDurationMs={item.totalDurationMs}
            />
            <View className="pt-2">
              <Large className="border-none" numberOfLines={1}>
                {item.title}
              </Large>
              {item.authors ? (
                <Muted numberOfLines={1}>
                  {item.authors.map((author) => author.name).join(', ')}
                </Muted>
              ) : null}
              {item.contributors ? (
                <Muted numberOfLines={1}>
                  {item.contributors.map((contributor) => contributor.name).join(', ')}
                </Muted>
              ) : null}
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}
