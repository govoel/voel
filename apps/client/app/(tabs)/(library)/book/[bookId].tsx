import { FlashList } from '@shopify/flash-list';
import { useSelector } from '@xstate/store/react';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ExpandableSummary } from '~/components/expandable-summary';
import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';
import { H2, Large, Muted, Small } from '~/components/ui/typography';

import api from '~/lib/api';
import { BookCopy } from '~/lib/icons/BookCopy';
import { MicVocal } from '~/lib/icons/MicVocal';
import { Play } from '~/lib/icons/Play';
import { Timer } from '~/lib/icons/Timer';
import { UserPen } from '~/lib/icons/UserPen';
import { instanceStore } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

import Player, { type AudioSource, replaceAudioSources } from '~/modules/voel-audio';

const formatTime = (timeMs: number) => {
  const sec = Math.floor(timeMs / 1000);
  const s = sec % 60;
  const m = Math.floor((sec % 3600) / 60);
  const h = Math.floor(sec / 3600);

  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatDuration = (durationMs: number, type: 'short' | 'long' = 'long') => {
  const sec = Math.floor(durationMs / 1000);
  const s = sec % 60;
  const m = Math.floor((sec % 3600) / 60);
  const h = Math.floor(sec / 3600);

  if (type === 'short') {
    const str = [h > 0 ? `${h}h` : null, m > 0 ? `${m}m` : null, s > 0 ? `${s}s` : null]
      .filter((i) => i !== null)
      .join(' ');

    if (str.length > 0) return str;
    return `${durationMs}ms`;
  }

  const str = [h > 0 ? `${h} hrs` : null, m > 0 ? `${m} min` : null, s > 0 ? `${s} sec` : null]
    .filter((i) => i !== null)
    .join(' ');

  if (str.length > 0) return str;

  return `${durationMs} ms`;
};

export default function BookScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch } = api.books.get.useQuery(instanceDb, parseInt(bookId, 10));

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Book' }} />
      <FloatingPlayerDodgingLayout>
        {error ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading book {bookId}</Large>
              <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => refetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </Card>
        ) : data ? (
          <>
            <AspectRatio ratio={1 / 1} className="mx-12">
              <Image
                className="w-full h-full rounded-md"
                source={data.cover}
                placeholder={{ thumbhash: data.coverThumbhash }}
              />
            </AspectRatio>

            <H2 className="border-0 pt-4 text-center">{data.title}</H2>
            <Small className="text-center">{data.subtitle}</Small>

            <BookPlayButton book={data} />

            <View className="flex flex-row flex-wrap gap-2 items-center pt-4">
              <Timer className="text-muted-foreground" size={20} />
              <Badge variant="outline">
                <Text>{formatDuration(data.files.reduce((sum, i) => sum + i.durationMs, 0))}</Text>
              </Badge>
            </View>

            <View className="flex flex-row flex-wrap gap-2 items-center pt-2">
              <UserPen className="text-muted-foreground" size={20} />
              <View className="flex flex-row flex-wrap gap-2 items-center">
                {data.authors.map((author, index) => (
                  <Link
                    key={`author-${index}`}
                    href={{
                      pathname: '/(tabs)/(library)/author/[authorId]',
                      params: { authorId: author.id },
                    }}
                    push
                    asChild>
                    <Badge variant="secondary">
                      <Text>{author.name}</Text>
                    </Badge>
                  </Link>
                ))}
              </View>
            </View>

            <View className="flex flex-row flex-nowrap gap-2 items-center pt-2">
              <MicVocal className="text-muted-foreground" size={20} />
              <View className="flex flex-row flex-wrap gap-2 items-center">
                {data.contributors.map((contributor, index) =>
                  contributor.role === 'narrator' ? (
                    <Link
                      key={`contributor-narrator-${index}`}
                      href={{
                        pathname: '/(tabs)/(library)/narrator/[narratorName]',
                        params: { narratorName: contributor.name },
                      }}
                      push
                      asChild>
                      <Badge variant="secondary">
                        <Text>{contributor.name}</Text>
                      </Badge>
                    </Link>
                  ) : null
                )}
              </View>
            </View>

            <View className="flex flex-row flex-wrap gap-2 items-center pt-2">
              <BookCopy className="text-muted-foreground" size={20} />
              <View className="flex flex-row flex-wrap gap-2 items-center">
                {data.series.map((series, index) => (
                  <Link
                    key={`series-${index}`}
                    href={{
                      pathname: '/(tabs)/(library)/series/[seriesId]',
                      params: { seriesId: series.id },
                    }}
                    push
                    asChild>
                    <Badge variant="secondary">
                      <View className="flex flex-row justify-center items-center">
                        <Text className="border-r border-muted-foreground/50 pr-1">
                          {series.label}
                        </Text>
                        <Text className="pl-1">{series.name}</Text>
                      </View>
                    </Badge>
                  </Link>
                ))}
              </View>
            </View>

            <View className="pt-4">
              <ExpandableSummary
                summary={data.summary ?? '_A summary is not available for this book._'}
                expandText="Expand Summary"
                collapseText="Collapse Summary"
              />
            </View>

            <Accordion className="pt-4" type="multiple" collapsable>
              <AccordionItem value="chapters">
                <AccordionTrigger>
                  <Text className="font-semibold">Chapters</Text>
                </AccordionTrigger>
                <AccordionContent>
                  <BookChapters chapters={data.chapters} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="files">
                <AccordionTrigger>
                  <Text className="font-semibold">Files</Text>
                </AccordionTrigger>
                <AccordionContent>
                  <BookFiles files={data.files} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        ) : (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        )}
      </FloatingPlayerDodgingLayout>
    </>
  );
}

const BookPlayButton = ({
  book,
}: {
  book: {
    id: number;
    title: string;
    cover: string | null;
    authors: { name: string }[];
    chapters: {
      audible: {
        id: number;
        bookId: number;
        title: string;
        startOffsetMs: number;
        durationMs: number;
      }[];
      file: {
        id: number;
        bookId: number;
        fileId: number;
        title: string;
        startOffsetMs: number;
        durationMs: number;
      }[];
    };
    files: { id: number; durationMs: number; disc: number; track: number }[];
  };
}) => {
  const authInstance = useSelector(instanceStore, (state) => state.context.authInstance);
  const instanceID = useSelector(instanceStore, (state) => state.context.instanceID);
  const instanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);

  const fileEndTimes = useMemo(() => {
    return book.files.reduce<number[]>((acc, file, index) => {
      const previousEndTime = index > 0 ? acc[index - 1] : 0;
      acc.push(previousEndTime + file.durationMs);
      return acc;
    }, []);
  }, [book.files]);

  const audioSources = useMemo(() => {
    let canUseAudible = book.chapters.audible.length > 0;
    let chapters: AudioSource[] = [];

    if (canUseAudible) {
      for (const chapter of book.chapters.audible) {
        const fileIndex = fileEndTimes.findIndex((endTime) => chapter.startOffsetMs <= endTime);

        if (fileIndex === -1) {
          canUseAudible = false;
          break;
        }

        const file = book.files[fileIndex];
        const fileAbsoluteStartTime = fileIndex > 0 ? fileEndTimes[fileIndex - 1] : 0;
        const chapterRelativeStartTime = chapter.startOffsetMs - fileAbsoluteStartTime;

        chapters.push({
          instanceId: instanceID,
          bookId: chapter.bookId,
          fileId: file.id,
          chapterId: chapter.id,
          bookTitle: book.title,
          chapterTitle: chapter.title,
          author: book.authors.map((author) => author.name).join(', '),
          fileUri: `${instanceURL}/api/v1/files/${file.id}`,
          artworkUri: book.cover,
          startTimeMs: chapterRelativeStartTime,
          endTimeMs: chapterRelativeStartTime + chapter.durationMs,
        });
      }
    }

    if (!canUseAudible) {
      chapters = book.chapters.file.map((chapter) => ({
        instanceId: instanceID,
        bookId: chapter.bookId,
        fileId: chapter.fileId,
        chapterId: chapter.id,
        bookTitle: book.title,
        chapterTitle: chapter.title,
        author: book.authors.map((author) => author.name).join(', '),
        fileUri: `${instanceURL}/api/v1/files/${chapter.fileId}`,
        artworkUri: book.cover,
        startTimeMs: chapter.startOffsetMs,
        endTimeMs: chapter.startOffsetMs + chapter.durationMs,
      }));
    }

    return chapters;
  }, [book, instanceURL, instanceID, fileEndTimes]);

  return (
    <Button
      className="mt-4"
      onPress={() => {
        replaceAudioSources(authInstance.getCookie(), audioSources);
        Player.play();
      }}>
      <Text>Play</Text>
    </Button>
  );
};

const BookChapters = ({
  chapters,
}: {
  chapters: {
    audible: {
      id: number;
      parentId: number | null;
      title: string;
      durationMs: number;
      startOffsetMs: number;
    }[];
    file: { id: number; title: string; durationMs: number; startOffsetMs: number }[];
  };
}) => {
  const [currentTab, setCurrentTab] = useState('audible');

  return (
    <Tabs value={currentTab} onValueChange={setCurrentTab}>
      <TabsList className="mb-4 w-full flex-row">
        <TabsTrigger value="audible" className="flex-1">
          <Text>Audible</Text>
        </TabsTrigger>
        <TabsTrigger value="file" className="flex-1">
          <Text>File</Text>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="audible">
        <ChapterList chapters={chapters.audible} />
      </TabsContent>
      <TabsContent value="file">
        <ChapterList chapters={chapters.file} />
      </TabsContent>
    </Tabs>
  );
};

const ChapterList = ({
  chapters,
}: {
  chapters: { id: number; title: string; durationMs: number; startOffsetMs: number }[];
}) => {
  return (
    <FlashList
      data={chapters}
      renderItem={({ item, index }) => (
        <View className={cn('flex flex-row flex-wrap items-center', index === 0 ? '' : 'mt-4')}>
          <View className="flex flex-row flex-wrap items-center gap-2">
            <Button className="h-12 py-1 flex flex-row" variant="outline" size="sm">
              <Play className="text-muted-foreground mr-2" size={16} />
              <View className="border-l border-input pl-2 flex justify-center items-center">
                <Text>{formatTime(item.startOffsetMs)}</Text>
                <Muted className="text-xs font-semibold">
                  {formatDuration(item.durationMs, 'short')}
                </Muted>
              </View>
            </Button>
            <View className="flex-1">
              <Small>{item.title}</Small>
            </View>
          </View>
        </View>
      )}
      keyExtractor={(item) => item.id.toString()}
      estimatedItemSize={56}
      ListEmptyComponent={() => (
        <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted">
          <Text className="text-center">No chapters found</Text>
        </View>
      )}
    />
  );
};

const BookFiles = ({
  files,
}: {
  files: { id: number; path: string; disc: number; track: number; durationMs: number }[];
}) => {
  return (
    <FlashList
      data={files}
      renderItem={({ item, index }) => (
        <View className={index === 0 ? '' : 'mb-4'}>
          <View className="flex flex-row flex-wrap gap-2" key={`file-${index}`}>
            <Badge variant="outline">
              <Text>{formatDuration(item.durationMs)}</Text>
            </Badge>
            <Badge variant="outline">
              <Text>Disc {item.disc}</Text>
            </Badge>
            <Badge variant="outline">
              <Text>Track {item.track}</Text>
            </Badge>
          </View>
          <Small className="pt-2">{item.path}</Small>
        </View>
      )}
      keyExtractor={(item) => item.id.toString()}
      estimatedItemSize={80}
      ListEmptyComponent={() => (
        <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted">
          <Text className="text-center">No chapters found</Text>
        </View>
      )}
    />
  );
};
