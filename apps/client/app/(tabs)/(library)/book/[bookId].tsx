import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { FlashList } from '@shopify/flash-list';
import { useSelector } from '@xstate/store/react';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
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
import { Alert, AlertTitle } from '~/components/ui/alert';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Badge } from '~/components/ui/badge';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button, ButtonWithLoading } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';
import { H2, Large, Muted, Small } from '~/components/ui/typography';

import api from '~/lib/api';
import { BookCopy } from '~/lib/icons/BookCopy';
import { FilePenLine } from '~/lib/icons/FilePenLine';
import { History } from '~/lib/icons/History';
import { Languages } from '~/lib/icons/Languages';
import { MicVocal } from '~/lib/icons/MicVocal';
import { OctagonAlert } from '~/lib/icons/OctagonAlert';
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

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
            {data.cover ? (
              <AspectRatio ratio={1 / 1} className="mx-12">
                <Image
                  className="w-full h-full rounded-md"
                  source={data.cover}
                  placeholder={{ thumbhash: data.coverThumbhash ?? undefined }}
                />
              </AspectRatio>
            ) : null}

            <H2 className="border-0 pt-4 text-center">{data.title}</H2>
            <Small className="text-center leading-snug">{data.subtitle}</Small>

            <View className="flex flex-row flex-wrap gap-x-2 items-center pt-2">
              <BookPlayButton bookId={data.id} />
              <PlaybackHistory bookId={data.id} />
            </View>

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

            <Narrators contributors={data.contributors} />
            <Translators contributors={data.contributors} />
            <Editors contributors={data.contributors} />

            {data.series.length > 0 ? (
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
                          <Text className="border-r border-muted-foreground/50 pr-2">
                            {series.label}
                          </Text>
                          <Text className="pl-2">{series.name}</Text>
                        </View>
                      </Badge>
                    </Link>
                  ))}
                </View>
              </View>
            ) : null}

            {data.summary ? (
              <View className="pt-4">
                <ExpandableSummary
                  summary={data.summary}
                  expandText="Expand Summary"
                  collapseText="Collapse Summary"
                />
              </View>
            ) : null}

            <Accordion className="pt-4" type="multiple" collapsable>
              <AccordionItem value="chapters">
                <AccordionTrigger>
                  <Text className="font-semibold">Chapters</Text>
                </AccordionTrigger>
                <AccordionContent>
                  <BookChapters bookId={data.id} chapters={data.chapters} />
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

const Narrators = ({
  contributors,
}: {
  contributors: { role: 'narrator' | 'editor' | 'translator' | 'illustrator'; name: string }[];
}) => {
  const narrators = useMemo(
    () => contributors.filter((contributor) => contributor.role === 'narrator'),
    [contributors]
  );

  if (narrators.length === 0) return null;

  return (
    <View className="flex flex-row flex-nowrap gap-2 items-center pt-2">
      <MicVocal className="text-muted-foreground" size={20} />
      <View className="flex flex-row flex-wrap gap-2 items-center">
        {narrators.map((contributor, index) => (
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
        ))}
      </View>
    </View>
  );
};

const Editors = ({
  contributors,
}: {
  contributors: { role: 'narrator' | 'editor' | 'translator' | 'illustrator'; name: string }[];
}) => {
  const editors = useMemo(
    () => contributors.filter((contributor) => contributor.role === 'editor'),
    [contributors]
  );

  if (editors.length === 0) return null;

  return (
    <View className="flex flex-row flex-nowrap gap-2 items-center pt-2">
      <FilePenLine className="text-muted-foreground" size={20} />
      <View className="flex flex-row flex-wrap gap-2 items-center">
        {editors.map((contributor, index) => (
          <Link
            key={`contributor-editor-${index}`}
            href={{
              pathname: '/(tabs)/(library)/editor/[editorName]',
              params: { editorName: contributor.name },
            }}
            push
            asChild>
            <Badge variant="secondary">
              <Text>{contributor.name}</Text>
            </Badge>
          </Link>
        ))}
      </View>
    </View>
  );
};

const Translators = ({
  contributors,
}: {
  contributors: { role: 'narrator' | 'editor' | 'translator' | 'illustrator'; name: string }[];
}) => {
  const translators = useMemo(
    () => contributors.filter((contributor) => contributor.role === 'translator'),
    [contributors]
  );

  if (translators.length === 0) return null;

  return (
    <View className="flex flex-row flex-nowrap gap-2 items-center pt-2">
      <Languages className="text-muted-foreground" size={20} />
      <View className="flex flex-row flex-wrap gap-2 items-center">
        {translators.map((contributor, index) => (
          <Link
            key={`contributor-translator-${index}`}
            href={{
              pathname: '/(tabs)/(library)/translator/[translatorName]',
              params: { translatorName: contributor.name },
            }}
            push
            asChild>
            <Badge variant="secondary">
              <Text>{contributor.name}</Text>
            </Badge>
          </Link>
        ))}
      </View>
    </View>
  );
};

const playBookFrom = (
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
    files: { id: number; durationMs: number }[];
  },
  absolutePositionMs: number,
  authCookie: string,
  instanceID: string,
  instanceURL: string
) => {
  const fileEndTimes = book.files.reduce((acc, file, index) => {
    const previousEndTime = index > 0 ? acc[index - 1] : 0;
    acc.push(previousEndTime + file.durationMs);
    return acc;
  }, [] as number[]);

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

  replaceAudioSources(authCookie, chapters);

  if (absolutePositionMs > 0) {
    let startFromChapter = 0;
    for (const [index, chapter] of chapters.entries()) {
      if (chapter.startTimeMs > absolutePositionMs) {
        startFromChapter = index - 1;
        break;
      }
    }

    Player.seekTo(startFromChapter, absolutePositionMs - chapters[startFromChapter].startTimeMs);
    Player.play();
  } else {
    Player.play();
  }
};

const BookPlayButton = ({ bookId }: { bookId: number }) => {
  const authInstance = useSelector(instanceStore, (state) => state.context.authInstance);
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const instanceID = useSelector(instanceStore, (state) => state.context.instanceID);
  const instanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);
  const {
    data: book,
    isLoading: isBookLoading,
    error: bookError,
    refetch: refetchBook,
  } = api.books.get.useQuery(instanceDb, bookId);
  const currentPlaybackPosition = api.books.getPlaybackPosition.useQuery(instanceDb, bookId);

  if (book) {
    return (
      <Button
        className="mt-4 flex-1"
        onPress={() => {
          playBookFrom(
            book,
            currentPlaybackPosition,
            authInstance.getCookie(),
            instanceID ?? '0',
            instanceURL ?? 'http://voel.local'
          );
        }}>
        {currentPlaybackPosition >= 0 ? (
          <Text>Play from {formatTime(currentPlaybackPosition)}</Text>
        ) : (
          <Text>Play from beginning</Text>
        )}
      </Button>
    );
  }

  if (bookError) {
    return (
      <Button
        variant="destructive"
        className="mt-4 flex-1"
        onPress={() => {
          refetchBook();
        }}>
        <Text>Couldn&rsquo;t load book. Click to try again.</Text>
      </Button>
    );
  }

  return (
    <ButtonWithLoading
      viewClassName="mt-4 flex-1"
      disabled={isBookLoading}
      isLoading={isBookLoading}>
      <Text>Play</Text>
    </ButtonWithLoading>
  );
};

const PlaybackHistory = ({ bookId }: { bookId: number }) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const authInstance = useSelector(instanceStore, (state) => state.context.authInstance);
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const instanceID = useSelector(instanceStore, (state) => state.context.instanceID);
  const instanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);
  const {
    data: book,
    isLoading: isBookLoading,
    error: bookError,
    refetch: refetchBook,
  } = api.books.get.useQuery(instanceDb, bookId);
  const { mergedPlaybackHistory, refetch, error } = api.books.getPlaybackHistory.useQuery(
    instanceDb,
    bookId
  );

  return (
    <>
      <Button
        variant="secondary"
        className="text-secondary-foreground"
        onPress={() => {
          bottomSheetModalRef.current?.present();
        }}>
        <History className="text-secondary-foreground" size="20" />
      </Button>

      <BottomSheet ref={bottomSheetModalRef} snapPoints={['50%']}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Playback History</Large>
          {error ? (
            <Alert className="mb-2" icon={OctagonAlert} variant="destructive">
              <AlertTitle className="pb-2">
                Failed to fetch playback history from the database
              </AlertTitle>
              <Button
                size="sm"
                variant="destructive"
                onPress={() => {
                  refetch();
                }}>
                <Text>Refetch</Text>
              </Button>
            </Alert>
          ) : null}
          {mergedPlaybackHistory.length === 0 ? (
            <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
              <Text className="text-center">No playback history found</Text>
            </View>
          ) : (
            mergedPlaybackHistory.map((event, index) => (
              <View key={`${event.source}-${event.id}`} className="mb-1">
                <View className="flex flex-row items-center gap-x-2">
                  {book ? (
                    <Button
                      className="h-12 py-1 flex flex-row"
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        playBookFrom(
                          book,
                          event.positionMs,
                          authInstance.getCookie(),
                          instanceID ?? '0',
                          instanceURL ?? 'http://voel.local'
                        );
                      }}>
                      <Play className="text-muted-foreground mr-2" size={16} />
                      <View className="border-l border-input pl-2 flex justify-center items-center">
                        <Text>{formatTime(event.positionMs)}</Text>
                      </View>
                    </Button>
                  ) : bookError ? (
                    <Button
                      className="h-12 py-1 flex flex-row"
                      variant="destructive"
                      size="sm"
                      onPress={() => {
                        refetchBook();
                      }}>
                      <OctagonAlert className="text-red-200 mr-2" size={16} />
                      <View className="border-l border-input pl-2 flex justify-center items-center">
                        <Text>Couldn&rsquo;t load book</Text>
                        <Muted className="text-xs font-semibold text-red-200">Click to Retry</Muted>
                      </View>
                    </Button>
                  ) : (
                    <ButtonWithLoading
                      className="h-12 w-24 py-1 flex flex-row"
                      variant="outline"
                      size="sm"
                      disabled={isBookLoading}
                      isLoading={isBookLoading}
                    />
                  )}
                  <View>
                    <View className="flex flex-row items-center gap-x-2">
                      <Text>
                        {event.type === 1002
                          ? 'Begin Playback'
                          : event.type === 1003 || event.type === 1006 || event.type === 1007
                            ? 'Pause'
                            : event.type === 1004
                              ? 'Seek From'
                              : event.type === 1005
                                ? 'Seeked To'
                                : 'Unknown Event'}
                      </Text>
                      <Badge variant="outline">
                        <Text>{event.source === 'local' ? 'Local' : 'Database'}</Text>
                      </Badge>
                    </View>
                    <Muted>{new Date(event.eventTimestampMs).toLocaleString()}</Muted>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </BottomSheet>
    </>
  );
};

const BookChapters = ({
  bookId,
  chapters,
}: {
  bookId: number;
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
        <ChapterList bookId={bookId} chapters={chapters.audible} />
      </TabsContent>
      <TabsContent value="file">
        <ChapterList bookId={bookId} chapters={chapters.file} />
      </TabsContent>
    </Tabs>
  );
};

const ChapterList = ({
  bookId,
  chapters,
}: {
  bookId: number;
  chapters: { id: number; title: string; durationMs: number; startOffsetMs: number }[];
}) => {
  const authInstance = useSelector(instanceStore, (state) => state.context.authInstance);
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const instanceID = useSelector(instanceStore, (state) => state.context.instanceID);
  const instanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);
  const {
    data: book,
    isLoading: isBookLoading,
    error: bookError,
    refetch: refetchBook,
  } = api.books.get.useQuery(instanceDb, bookId);

  return (
    <FlashList
      data={chapters}
      renderItem={({ item, index }) => (
        <View className={cn('flex flex-row flex-wrap items-center', index === 0 ? '' : 'mt-4')}>
          <View className="flex flex-row flex-wrap items-center gap-2">
            {book ? (
              <Button
                className="h-12 py-1 flex flex-row"
                variant="outline"
                size="sm"
                onPress={() => {
                  playBookFrom(
                    book,
                    item.startOffsetMs,
                    authInstance.getCookie(),
                    instanceID ?? '0',
                    instanceURL ?? 'http://voel.local'
                  );
                }}>
                <Play className="text-muted-foreground mr-2" size={16} />
                <View className="border-l border-input pl-2 flex justify-center items-center">
                  <Text>{formatTime(item.startOffsetMs)}</Text>
                  <Muted className="text-xs font-semibold">
                    {formatDuration(item.durationMs, 'short')}
                  </Muted>
                </View>
              </Button>
            ) : bookError ? (
              <Button
                className="h-12 py-1 flex flex-row"
                variant="destructive"
                size="sm"
                onPress={() => {
                  refetchBook();
                }}>
                <OctagonAlert className="text-red-200 mr-2" size={16} />
                <View className="border-l border-input pl-2 flex justify-center items-center">
                  <Text>Couldn&rsquo;t load book</Text>
                  <Muted className="text-xs font-semibold text-red-200">Click to Retry</Muted>
                </View>
              </Button>
            ) : (
              <ButtonWithLoading
                className="h-12 w-24 py-1 flex flex-row"
                variant="outline"
                size="sm"
                disabled={isBookLoading}
                isLoading={isBookLoading}
              />
            )}
            <View className="flex-1">
              <Small className="leading-snug">{item.title}</Small>
            </View>
          </View>
        </View>
      )}
      keyExtractor={(item) => item.id.toString()}
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
          <Small className="pt-2 leading-snug">{item.path}</Small>
        </View>
      )}
      keyExtractor={(item) => item.id.toString()}
      ListEmptyComponent={() => (
        <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted">
          <Text className="text-center">No chapters found</Text>
        </View>
      )}
    />
  );
};
