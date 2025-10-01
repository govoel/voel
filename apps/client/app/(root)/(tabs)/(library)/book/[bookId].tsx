import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  type BottomSheetModal as BottomSheetModalType,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useMutation } from '@tanstack/react-query';
import { schemas } from '@voel/schemas';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { toast } from 'sonner-native';

import { ExpandableSummary } from '~/components/expandable-summary';
import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { BookCopy } from '~/components/icons/BookCopy';
import { ChevronDown } from '~/components/icons/ChevronDown';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { ChevronUp } from '~/components/icons/ChevronUp';
import { EllipsisVertical } from '~/components/icons/EllipsisVertical';
import { FilePen } from '~/components/icons/FilePen';
import { FilePenLine } from '~/components/icons/FilePenLine';
import { History } from '~/components/icons/History';
import { Languages } from '~/components/icons/Languages';
import { MicVocal } from '~/components/icons/MicVocal';
import { NotebookPen } from '~/components/icons/NotebookPen';
import { OctagonAlert } from '~/components/icons/OctagonAlert';
import { PenTool } from '~/components/icons/PenTool';
import { Play } from '~/components/icons/Play';
import { Timer } from '~/components/icons/Timer';
import { Trash } from '~/components/icons/Trash';
import { Image } from '~/components/image';
import { usePlaybackHistoryContext } from '~/components/playback-history-provider';
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
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button, ButtonWithLoading } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Progress } from '~/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';
import { H2, Large, Muted, Small } from '~/components/ui/typography';

import api from '~/lib/api';
import {
  useApiInstance,
  useAuthInstance,
  useInstanceId,
  useInstanceURL,
} from '~/lib/stores/instance';
import { cn, formatBytes, formatDuration, formatTime } from '~/lib/utils';

import Player, {
  type AudioSource,
  replaceAudioSources,
  useDownloadStatus,
} from '~/modules/voel-audio';

const SvgInterop = cssInterop(Svg, { className: 'style' });

export default function BookScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const { data, error, refetch } = api.books.get.useQuery(parseInt(bookId, 10));

  const authors = useMemo(() => {
    if (!data) return [];
    return data.contributors.filter((a) => a.role === 'author');
  }, [data]);

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Book' }} />
      <FloatingPlayerDodgingScrollView>
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
            {data.subtitle ? (
              <Small className="text-center leading-snug pb-2">{data.subtitle}</Small>
            ) : null}

            <View className="flex flex-row flex-wrap gap-x-2 items-center">
              <MoreOptionsBottomSheet book={{ ...data, authors }} />
              <ManageDownloads
                book={{
                  id: data.id,
                  title: data.title,
                  authors: authors.map((a) => a.name).join(', '),
                }}
                files={data.files}
              />
              <BookPlayButton book={{ ...data, authors }} />
            </View>

            <View className="flex flex-row flex-nowrap items-center gap-1 pt-4">
              <Timer className="text-muted-foreground" size={20} />
              <View className="flex flex-row flex-wrap flex-shrink items-center gap-1 border-l border-muted-foreground/50 pl-1.5">
                <Badge variant="outline">
                  <Text>
                    {formatDuration(data.files.reduce((sum, i) => sum + i.durationMs, 0))}
                  </Text>
                </Badge>
              </View>
            </View>

            <Contributors role="author" contributors={data.contributors} />
            <Contributors role="narrator" contributors={data.contributors} />

            {data.series.length > 0 ? (
              <View className="flex flex-row flex-nowrap items-center justify-start gap-1 pt-2">
                <BookCopy className="text-muted-foreground" size={20} />
                <View className="flex flex-row flex-wrap flex-shrink items-center gap-1 border-l border-muted-foreground/50 pl-1.5">
                  {data.series.map((series, index) => (
                    <Link
                      key={`series-${index}`}
                      href={
                        series.id
                          ? {
                              pathname: '/series/id/[seriesId]',
                              params: { seriesId: series.id },
                            }
                          : {
                              pathname: '/series/name/[seriesName]',
                              params: { seriesName: series.name },
                            }
                      }
                      push
                      asChild>
                      <Badge variant="secondary" className="flex-nowrap gap-2">
                        <Text>{series.label}</Text>
                        <Text className="border-l border-muted-foreground/50 pl-2 flex-shrink">
                          {series.name}
                        </Text>
                      </Badge>
                    </Link>
                  ))}
                </View>
              </View>
            ) : null}

            <Contributors role="translator" contributors={data.contributors} />
            <Contributors role="editor" contributors={data.contributors} />

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
                  <BookChapters book={{ ...data, authors }} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        ) : (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        )}
      </FloatingPlayerDodgingScrollView>
    </>
  );
}

const Contributors = ({
  contributors,
  role,
}: {
  contributors: {
    contributorId: number | null;
    role: 'author' | 'narrator' | 'editor' | 'translator' | 'foreword';
    name: string;
  }[];
  role: 'author' | 'narrator' | 'editor' | 'translator';
}) => {
  const filteredContributors = useMemo(
    () => contributors.filter((contributor) => contributor.role === role),
    [contributors, role]
  );

  if (filteredContributors.length === 0) return null;

  return (
    <View className="flex flex-row flex-nowrap items-center justify-start gap-1 pt-2">
      {role === 'author' && <PenTool className="text-muted-foreground" size={20} />}
      {role === 'narrator' && <MicVocal className="text-muted-foreground" size={20} />}
      {role === 'editor' && <FilePenLine className="text-muted-foreground" size={20} />}
      {role === 'translator' && <Languages className="text-muted-foreground" size={20} />}
      <View className="flex flex-row flex-wrap flex-shrink items-center gap-1 border-l border-muted-foreground/50 pl-1.5">
        {filteredContributors.map((contributor, index) => (
          <Link
            key={`${role}-${index}`}
            href={
              contributor.contributorId
                ? {
                    pathname: '/contributor/id/[contributorId]',
                    params: { contributorId: contributor.contributorId },
                  }
                : {
                    pathname: '/contributor/name/[contributorName]',
                    params: { contributorName: contributor.name },
                  }
            }
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
  instanceId: string,
  instanceURL: string,
  canUseAudible: boolean = true
) => {
  const fileEndTimes = book.files.reduce((acc, file, index) => {
    const previousEndTime = index > 0 ? acc[index - 1] : 0;
    acc.push(previousEndTime + file.durationMs);
    return acc;
  }, [] as number[]);

  let chapters: (AudioSource & { endTimeMs: number })[] = [];

  if (canUseAudible && book.chapters.audible.length > 0) {
    for (const chapter of book.chapters.audible) {
      const startFileIndex = fileEndTimes.findIndex((endTime) => chapter.startOffsetMs <= endTime);

      if (startFileIndex === -1) {
        canUseAudible = false;
        break;
      }

      const chapterEndTime = chapter.startOffsetMs + chapter.durationMs;
      let endFileIndex = fileEndTimes.findIndex((endTime) => chapterEndTime <= endTime);
      if (endFileIndex === -1) {
        endFileIndex = fileEndTimes.length - 1;
      }

      const fileAbsoluteStartTime = startFileIndex > 0 ? fileEndTimes[startFileIndex - 1] : 0;
      const startFileRelativeChapterStartTime = chapter.startOffsetMs - fileAbsoluteStartTime;

      const chapterFileIds = Array.from(
        { length: endFileIndex - (startFileIndex - 1) },
        (e, i) => ({
          fileArrayIndex: i + startFileIndex,
          fileId: book.files[i + startFileIndex].id,
        })
      );

      chapters.push({
        instanceId: instanceId,
        bookId: chapter.bookId,
        chapterId: chapter.id,
        bookTitle: book.title,
        chapterTitle: chapter.title,
        author: book.authors.map((author) => author.name).join(', '),
        files: chapterFileIds.map((e) => ({
          id: e.fileId,
          uri: `${instanceURL}/api/v1/files/${e.fileId}`,
          durationMs: book.files[e.fileArrayIndex].durationMs,
        })),
        artworkUri: book.cover,
        startTimeMs: startFileRelativeChapterStartTime,
        endTimeMs: startFileRelativeChapterStartTime + chapter.durationMs,
      });
    }
  }

  if (!canUseAudible) {
    chapters = book.chapters.file.map((chapter, index) => ({
      instanceId: instanceId,
      bookId: chapter.bookId,
      chapterId: chapter.id,
      bookTitle: book.title,
      chapterTitle:
        typeof chapter.title === 'string' && chapter.title.length > 0
          ? chapter.title
          : `Untitled chapter #${index + 1}`,
      author: book.authors.map((author) => author.name).join(', '),
      files: [
        {
          id: chapter.fileId,
          uri: `${instanceURL}/api/v1/files/${chapter.fileId}`,
          durationMs: chapter.durationMs,
        },
      ],
      artworkUri: book.cover,
      startTimeMs: chapter.startOffsetMs,
      endTimeMs: chapter.startOffsetMs + chapter.durationMs,
    }));
  }

  if (absolutePositionMs > 0) {
    let startFromChapter = 0;
    let durationSoFar = 0;
    for (const [index, chapter] of chapters.entries()) {
      if (durationSoFar + (chapter.endTimeMs - chapter.startTimeMs) > absolutePositionMs) {
        startFromChapter = index;
        break;
      } else {
        durationSoFar += chapter.endTimeMs - chapter.startTimeMs;
      }
    }

    replaceAudioSources(authCookie, chapters, startFromChapter, absolutePositionMs - durationSoFar);
  } else {
    replaceAudioSources(authCookie, chapters, 0, 0);
  }
};

const ManageDownloads = ({
  book,
  files,
}: {
  book: { id: number; title: string; authors: string };
  files: {
    id: number;
    path: string;
    customOrder: number | null;
    disc: number;
    track: number;
    durationMs: number;
  }[];
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModalType>(null);
  const authInstance = useAuthInstance();
  const instanceId = useInstanceId();
  const instanceURL = useInstanceURL();

  const [isRemoveDownloadsLoading, setIsRemoveDownloadsLoading] = useState(false);
  const [isResumeDownloadsLoading, setIsResumeDownloadsLoading] = useState(false);
  const [isPauseDownloadsLoading, setIsPauseDownloadsLoading] = useState(false);
  const [isDownloadFilesLoading, setIsDownloadFilesLoading] = useState(false);

  const {
    data: downloads,
    error,
    isLoading,
    refetch: refetchDownloadsStatus,
  } = useDownloadStatus(
    instanceId,
    files.map((file) => file.id)
  );

  return (
    <>
      <ButtonWithLoading
        isLoading={isLoading}
        spinnerSize={3}
        variant="secondary"
        className="text-secondary-foreground w-10 native:w-12 p-0 native:p-0"
        onPress={() => {
          bottomSheetModalRef.current?.present();
        }}>
        <View className="absolute inset-0 flex justify-center items-center">
          <SvgInterop
            className={cn(error ? 'text-red-300/20' : 'text-muted-foreground/30')}
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round">
            <Circle cx="50%" cy="50%" r="10" />
          </SvgInterop>
        </View>
        {downloads && (
          <SvgInterop
            className={cn(error ? 'text-red-300' : 'text-secondary-foreground')}
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round">
            <Circle
              cx="50%"
              cy="50%"
              r="10"
              strokeWidth={3}
              strokeDasharray={2 * Math.PI * 10}
              strokeDashoffset={
                2 *
                Math.PI *
                10 *
                (1 -
                  Object.values(downloads).reduce(
                    (a, c) =>
                      a + (c.contentLength === -1 ? 0 : c.bytesDownloaded / c.contentLength),
                    0
                  ) /
                    files.length)
              }
              transform="rotate(-90 12 12)"
            />
            <Path d="M12 8v8" />
            <Path d="m8 12 4 4 4-4" />
          </SvgInterop>
        )}
      </ButtonWithLoading>

      <BottomSheetModal ref={bottomSheetModalRef} enableDynamicSizing={true}>
        <BottomSheetFlatList
          contentContainerClassName="p-6 mx-auto w-full max-w-[400px]"
          windowSize={5}
          data={files}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => (
            <Card className={index === 0 ? '' : 'mt-4'}>
              <CardContent className="px-4 py-2">
                <View className="flex flex-row flex-wrap gap-2">
                  <Badge variant="outline">
                    <Text>{formatDuration(item.durationMs)}</Text>
                  </Badge>
                  {item.customOrder ? (
                    <Badge variant="outline">
                      <Text>Custom Order {item.customOrder}</Text>
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="outline">
                        <Text>Disc {item.disc}</Text>
                      </Badge>
                      <Badge variant="outline">
                        <Text>Track {item.track}</Text>
                      </Badge>
                    </>
                  )}
                </View>
                <Small className="pt-2 leading-snug">{item.path}</Small>
                {downloads && item.id in downloads ? (
                  <>
                    <Progress
                      className="mt-2"
                      value={
                        downloads[item.id].contentLength === -1
                          ? 0
                          : (downloads[item.id].bytesDownloaded /
                              downloads[item.id].contentLength) *
                            100
                      }
                    />
                    <Small className="mt-2 text-center leading-snug">
                      {downloads[item.id].state === 0
                        ? 'Queued'
                        : downloads[item.id].state === 1
                          ? 'Stopped'
                          : downloads[item.id].state === 2
                            ? 'In progress'
                            : downloads[item.id].state === 3
                              ? 'Completed'
                              : downloads[item.id].state === 4
                                ? 'Failed'
                                : downloads[item.id].state === 5
                                  ? 'Removing'
                                  : downloads[item.id].state === 6
                                    ? 'Restarting'
                                    : ''}{' '}
                      / {formatBytes(downloads[item.id].bytesDownloaded)} /{' '}
                      {downloads[item.id].contentLength === -1
                        ? 0.0
                        : (
                            (downloads[item.id].bytesDownloaded /
                              downloads[item.id].contentLength) *
                            100
                          ).toFixed(2)}
                      %
                    </Small>
                  </>
                ) : null}
              </CardContent>
            </Card>
          )}
          ListHeaderComponent={
            <>
              <Large>Manage Downloads</Large>
              {downloads ? (
                <Muted className="text-sm mb-4">
                  {formatBytes(Object.values(downloads).reduce((a, c) => a + c.bytesDownloaded, 0))}{' '}
                  downloaded
                </Muted>
              ) : isLoading ? (
                <View className="p-12 justify-center items-center">
                  <Spinner size={15} />
                </View>
              ) : error ? (
                <Button
                  variant="destructive"
                  onPress={() => {
                    refetchDownloadsStatus();
                  }}>
                  <View className="pl-2 flex justify-center items-center">
                    <Text>Couldn&rsquo;t load downloads status</Text>
                    <Muted className="text-xs font-semibold text-red-200">Click to Retry</Muted>
                  </View>
                </Button>
              ) : null}

              {downloads && Object.keys(downloads).length > 0 ? (
                <>
                  <ButtonWithLoading
                    viewClassName="mb-1"
                    variant="destructive"
                    isLoading={isRemoveDownloadsLoading}
                    onPress={() => {
                      setIsRemoveDownloadsLoading(true);
                      setIsResumeDownloadsLoading(false);
                      setIsPauseDownloadsLoading(false);
                      setIsDownloadFilesLoading(false);
                      Player.removeDownloads(
                        instanceId,
                        files.map((file) => file.id)
                      );
                    }}>
                    <Text>Delete book files</Text>
                  </ButtonWithLoading>
                  {Object.values(downloads).some((d) => d.paused) ? (
                    <ButtonWithLoading
                      viewClassName="mb-1"
                      variant="secondary"
                      isLoading={isResumeDownloadsLoading}
                      onPress={() => {
                        setIsResumeDownloadsLoading(true);
                        setIsRemoveDownloadsLoading(false);
                        setIsPauseDownloadsLoading(false);
                        setIsDownloadFilesLoading(false);
                        Player.setCookie(authInstance.getCookie());
                        Player.resumeDownloads();
                      }}>
                      <Text>Resume all downloads</Text>
                    </ButtonWithLoading>
                  ) : (
                    <ButtonWithLoading
                      viewClassName="mb-1"
                      variant="secondary"
                      isLoading={isPauseDownloadsLoading}
                      onPress={() => {
                        setIsPauseDownloadsLoading(true);
                        setIsResumeDownloadsLoading(false);
                        setIsRemoveDownloadsLoading(false);
                        setIsDownloadFilesLoading(false);
                        Player.pauseDownloads();
                      }}>
                      <Text>Pause all downloads</Text>
                    </ButtonWithLoading>
                  )}
                </>
              ) : (
                <ButtonWithLoading
                  viewClassName="mb-1"
                  variant="secondary"
                  isLoading={isDownloadFilesLoading}
                  onPress={() => {
                    setIsDownloadFilesLoading(true);
                    setIsPauseDownloadsLoading(false);
                    setIsResumeDownloadsLoading(false);
                    setIsRemoveDownloadsLoading(false);
                    Player.setCookie(authInstance.getCookie());
                    Player.addDownloads(
                      instanceId,
                      files.map((file) => ({
                        uri: `${instanceURL}/api/v1/files/${file.id}`,
                        fileId: file.id,
                        filePath: file.path,
                        bookId: book.id,
                        bookTitle: book.title,
                        bookAuthors: book.authors,
                      }))
                    );
                  }}>
                  <Text>Download all files</Text>
                </ButtonWithLoading>
              )}
            </>
          }
          ListEmptyComponent={
            !error ? (
              <View className="mt-4 flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted">
                <Text className="text-center">No files found</Text>
              </View>
            ) : null
          }
        />
      </BottomSheetModal>
    </>
  );
};

const BookPlayButton = ({
  book,
}: {
  book: Parameters<typeof playBookFrom>[0] & {
    playbackPosition: { eventTimestampMs: number; positionMs: number };
  };
}) => {
  const instanceId = useInstanceId();

  const localPlaybackHistory = usePlaybackHistoryContext();
  const localPlaybackHistoryBookEvents =
    instanceId !== '0' && localPlaybackHistory.instanceId === instanceId
      ? localPlaybackHistory.events.filter((event) => event.bookId === book.id)
      : [];

  if (
    localPlaybackHistoryBookEvents.length > 0 &&
    localPlaybackHistoryBookEvents[0].eventTimestampMs > book.playbackPosition.eventTimestampMs
  ) {
    return (
      <PlayFromTimestampButton
        book={book}
        positionMs={localPlaybackHistoryBookEvents[0].positionMs}
      />
    );
  } else {
    return <PlayFromTimestampButton book={book} positionMs={book.playbackPosition.positionMs} />;
  }
};

const PlayFromTimestampButton = ({
  book,
  positionMs,
}: {
  book: Parameters<typeof playBookFrom>[0];
  positionMs: number;
}) => {
  const authInstance = useAuthInstance();
  const instanceId = useInstanceId();
  const instanceURL = useInstanceURL();

  return (
    <Button
      className="mt-4 flex-1"
      onPress={() => {
        playBookFrom(book, positionMs, authInstance.getCookie(), instanceId, instanceURL);
      }}>
      {positionMs > 0 ? (
        <Text>Play from {formatTime(positionMs)}</Text>
      ) : (
        <Text>Play from beginning</Text>
      )}
    </Button>
  );
};

const MoreOptionsBottomSheet = ({
  book,
}: {
  book: Parameters<typeof playBookFrom>[0] & {
    files: {
      id: number;
      path: string;
      customOrder: number | null;
      disc: number;
      track: number;
      durationMs: number;
    }[];
  };
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModalType | null>(null);
  const playbackHistoryModalRef = useRef<BottomSheetModalType | null>(null);
  const editBookFilesModalRef = useRef<BottomSheetModalType | null>(null);

  return (
    <>
      <Button
        variant="secondary"
        className="text-secondary-foreground w-10 native:w-12 p-0 native:p-0"
        onPress={() => {
          bottomSheetModalRef.current?.present();
        }}>
        <EllipsisVertical className="text-secondary-foreground" size="20" />
      </Button>

      <BottomSheetModal ref={bottomSheetModalRef} enableDynamicSizing={true}>
        <BottomSheetScrollView>
          <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
            <View className="overflow-hidden rounded-md border border-foreground/15">
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40"
                onPress={() => {
                  playbackHistoryModalRef.current?.present();
                }}>
                <View className="flex flex-row justify-center items-center gap-x-2">
                  <History className="text-muted-foreground" size="20" />
                  <Text>Playback History</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40"
                onPress={() => {
                  editBookFilesModalRef.current?.present();
                }}>
                <View className="flex flex-row justify-center items-center gap-x-2">
                  <FilePen className="text-muted-foreground" size="20" />
                  <Text>Edit Book Files</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
                <View className="flex flex-row justify-center items-center gap-x-2">
                  <NotebookPen className="text-muted-foreground" size="20" />
                  <Text>Edit Book Metadata</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none bg-secondary/40">
                <View className="flex flex-row justify-center items-center gap-x-2">
                  <Trash className="text-muted-foreground" size="20" />
                  <Text>Delete Book</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <PlaybackHistoryBottomSheet book={book} bottomSheetModalRef={playbackHistoryModalRef} />
      <EditBookFilesBottomSheet
        bookId={book.id}
        files={book.files}
        bottomSheetModalRef={editBookFilesModalRef}
      />
    </>
  );
};

const PlaybackHistoryBottomSheet = ({
  book,
  bottomSheetModalRef,
}: {
  book: Parameters<typeof playBookFrom>[0];
  bottomSheetModalRef: React.RefObject<BottomSheetModalType | null>;
}) => {
  const authInstance = useAuthInstance();
  const instanceId = useInstanceId();
  const instanceURL = useInstanceURL();
  const { mergedPlaybackHistory, refetch, error } = api.books.getPlaybackHistory.useQuery(book.id);

  return (
    <BottomSheetModal ref={bottomSheetModalRef} enableDynamicSizing={true}>
      <BottomSheetFlatList
        contentContainerClassName="p-6 mx-auto w-full max-w-[400px]"
        windowSize={5}
        data={mergedPlaybackHistory}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        renderItem={({ item, index }) => (
          <View className={cn('flex flex-row items-center gap-x-2', index === 0 ? '' : 'mt-4')}>
            <Button
              className="h-12 py-1 flex flex-row"
              variant="outline"
              size="sm"
              onPress={() => {
                playBookFrom(
                  book,
                  item.positionMs,
                  authInstance.getCookie(),
                  instanceId,
                  instanceURL
                );
              }}>
              <Play className="text-muted-foreground mr-2" size={16} />
              <View className="border-l border-input pl-2 flex justify-center items-center">
                <Text>{formatTime(item.positionMs)}</Text>
              </View>
            </Button>
            <View>
              <View className="flex flex-row items-center gap-x-2">
                <Text>
                  {item.type === 1002
                    ? 'Begin Playback'
                    : item.type === 1003 || item.type === 1006 || item.type === 1007
                      ? 'Pause'
                      : item.type === 1004
                        ? 'Seek From'
                        : item.type === 1005
                          ? 'Seeked To'
                          : 'Unknown Event'}
                </Text>
                <Badge variant="outline">
                  <Text>{item.source === 'local' ? 'Local' : 'Database'}</Text>
                </Badge>
              </View>
              <Muted>{new Date(item.eventTimestampMs).toLocaleString()}</Muted>
            </View>
          </View>
        )}
        ListHeaderComponent={
          <>
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
          </>
        }
        ListEmptyComponent={
          !error ? (
            <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
              <Text className="text-center">No playback history found</Text>
            </View>
          ) : null
        }
      />
    </BottomSheetModal>
  );
};

const EditBookFilesBottomSheet = ({
  bottomSheetModalRef,
  bookId,
  files,
}: {
  bottomSheetModalRef: React.RefObject<BottomSheetModalType | null>;
  bookId: number;
  files: {
    id: number;
    path: string;
    customOrder: number | null;
    disc: number;
    track: number;
    durationMs: number;
  }[];
}) => {
  const apiInstance = useApiInstance();
  const editBookFilesMutation = useMutation(
    apiInstance.v1.library.book.editFiles.mutationOptions({
      onSuccess: (result) => {
        toast.success(result.message);
        bottomSheetModalRef.current?.dismiss();
        editBookFilesMutation.reset();
        EditBookFilesForm.reset();
      },
      onError: (error) => {
        toast.error('Failed to save changes to book files', {
          description: error.message || 'Unknown error',
        });
      },
    })
  );

  const EditBookFilesForm = useAppForm({
    defaultValues: {
      bookId,
      files: files.map((file, index) => ({
        id: file.id,
        customOrder: (file.customOrder ?? index + 1).toString(),
      })),
    },
    validators: { onChange: schemas.v1.library.book.editFiles },
    onSubmit: async ({ value, formApi }) => {
      editBookFilesMutation.reset();
      await editBookFilesMutation.mutateAsync(value);
    },
  });

  const renderBackdrop = useCallback(
    (props: Exclude<BottomSheetBackdropProps, 'disappearsOnIndex' | 'appearsOnIndex'>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enableDynamicSizing={true}
      backdropComponent={renderBackdrop}
      onChange={() => {
        editBookFilesMutation.reset();
        EditBookFilesForm.reset();
      }}>
      <EditBookFilesForm.AppForm>
        <EditBookFilesForm.Field
          name="files"
          mode="array"
          children={(field) => (
            <BottomSheetFlatList
              contentContainerClassName="p-6 mx-auto w-full max-w-[400px]"
              windowSize={5}
              data={field.state.value}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={({ item, index }) => {
                const file = files.find((file) => file.id === item.id);
                if (!file) return null;

                return (
                  <Card className={index === 0 ? '' : 'mt-4'}>
                    <CardContent className="px-4 py-2">
                      <View className="flex flex-row flex-wrap gap-x-2">
                        <View className="flex-col flex-nowrap gap-y-1 justify-center items-center">
                          <Button
                            size="icon"
                            variant="outline"
                            disabled={EditBookFilesForm.state.isSubmitting || index === 0}
                            onPress={() =>
                              field.setValue((prev) => {
                                if (index === 0) return prev;

                                const next = [...prev];
                                const a = next[index - 1].id;
                                next[index - 1].id = next[index].id;
                                next[index].id = a;
                                return [...next];
                              })
                            }>
                            <ChevronUp className="text-foreground" />
                          </Button>
                          <EditBookFilesForm.AppField
                            name={`files[${index}].customOrder`}
                            children={(subField) => (
                              <subField.TextField
                                className="w-full max-w-10 pb-0"
                                inputProps={{
                                  className: 'p-1',
                                  textAlign: 'center',
                                  keyboardType: 'numeric',
                                  onBlur: () => {
                                    if (EditBookFilesForm.state.isValid) {
                                      field.setValue((prev) => {
                                        const next = [...prev];
                                        return next.sort(
                                          (a, b) =>
                                            parseInt(a.customOrder) - parseInt(b.customOrder)
                                        );
                                      });
                                    }
                                  },
                                }}
                              />
                            )}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            disabled={
                              EditBookFilesForm.state.isSubmitting ||
                              index === field.state.value.length - 1
                            }
                            onPress={() =>
                              field.setValue((prev) => {
                                if (index === prev.length - 1) return prev;

                                const next = [...prev];
                                const a = next[index + 1].id;
                                next[index + 1].id = next[index].id;
                                next[index].id = a;
                                return next;
                              })
                            }>
                            <ChevronDown className="text-foreground" />
                          </Button>
                        </View>
                        <View className="flex-1 justify-center">
                          <View className="flex flex-row flex-wrap gap-2">
                            <Badge variant="outline">
                              <Text>{formatDuration(file.durationMs)}</Text>
                            </Badge>
                            <Badge variant="outline">
                              <Text>Disc {file.disc}</Text>
                            </Badge>
                            <Badge variant="outline">
                              <Text>Track {file.track}</Text>
                            </Badge>
                          </View>
                          <Small className="pt-2 leading-snug">{file.path}</Small>
                          <Button
                            className="mt-2 py-1 h-fit native:h-fit"
                            size="sm"
                            variant="secondary"
                            onPress={() => field.removeValue(index)}>
                            <Text>Delete from book</Text>
                          </Button>
                        </View>
                      </View>
                    </CardContent>
                  </Card>
                );
              }}
              ListEmptyComponent={
                <View className="flex flex-col items-center justify-center px-8 py-16 border-dashed border-2 rounded-md border-muted mb-4 w-full">
                  <Text className="text-center">
                    No files in book, which will cause the book to be deleted
                  </Text>
                </View>
              }
              ListHeaderComponent={<Large className="pb-2">Edit Book Files</Large>}
              ListFooterComponent={
                <View className="flex flex-col flex-wrap gap-2 mt-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={EditBookFilesForm.state.isSubmitting}
                    onPress={() => EditBookFilesForm.reset()}>
                    <Text>Reset</Text>
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={EditBookFilesForm.state.isSubmitting}
                    onPress={() =>
                      field.setValue((prev) =>
                        prev.map((file, index) => ({
                          ...file,
                          customOrder: (index + 1).toString(),
                        }))
                      )
                    }>
                    <Text>Renumber Sequentially</Text>
                  </Button>
                  <EditBookFilesForm.SubmitButton>
                    <Text>Save Changes</Text>
                  </EditBookFilesForm.SubmitButton>
                </View>
              }
            />
          )}
        />
      </EditBookFilesForm.AppForm>
    </BottomSheetModal>
  );
};

const BookChapters = ({ book }: { book: Parameters<typeof playBookFrom>[0] }) => {
  const [currentTab, setCurrentTab] = useState('audible');

  return (
    <Tabs value={currentTab} onValueChange={setCurrentTab}>
      <TabsList className="mb-4 w-full flex-row">
        <TabsTrigger value="audible" className="flex-1">
          <Text>Audible ({book.chapters.audible.length})</Text>
        </TabsTrigger>
        <TabsTrigger value="file" className="flex-1">
          <Text>File ({book.chapters.file.length})</Text>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="audible">
        <ChapterList source="audible" book={book} />
      </TabsContent>
      <TabsContent value="file">
        <ChapterList source="file" book={book} />
      </TabsContent>
    </Tabs>
  );
};

const ChapterList = ({
  book,
  source,
}: {
  book: Parameters<typeof playBookFrom>[0];
  source: 'audible' | 'file';
}) => {
  const authInstance = useAuthInstance();
  const instanceId = useInstanceId();
  const instanceURL = useInstanceURL();

  const chapterEndTimes = useMemo(
    () =>
      source === 'file'
        ? book.chapters.file.reduce((acc, chapter, index) => {
            const previousEndTime = index > 0 ? acc[index - 1] : 0;
            acc.push(previousEndTime + chapter.durationMs);
            return acc;
          }, [] as number[])
        : [],
    [source, book.chapters.file]
  );

  return (
    <FlatList
      data={source === 'audible' ? book.chapters.audible : book.chapters.file}
      keyExtractor={(item) => item.id.toString()}
      scrollEnabled={false}
      renderItem={({ item, index }) => (
        <View className={cn('flex flex-row flex-wrap items-center', index === 0 ? '' : 'mt-4')}>
          <View className="flex flex-row flex-wrap items-center gap-2">
            <Button
              className="h-12 py-1 flex flex-row"
              variant="outline"
              size="sm"
              onPress={() => {
                playBookFrom(
                  book,
                  source === 'audible'
                    ? item.startOffsetMs
                    : index === 0
                      ? 0
                      : chapterEndTimes[index - 1],
                  authInstance.getCookie(),
                  instanceId,
                  instanceURL,
                  source === 'audible'
                );
              }}>
              <Play className="text-muted-foreground mr-2" size={16} />
              <View className="border-l border-input pl-2 flex justify-center items-center">
                <Text>
                  {formatTime(
                    source === 'audible'
                      ? item.startOffsetMs
                      : index === 0
                        ? 0
                        : chapterEndTimes[index - 1]
                  )}
                </Text>
                <Muted className="text-xs font-semibold">
                  {formatDuration(item.durationMs, 'short')}
                </Muted>
              </View>
            </Button>

            <View className="flex-1">
              {typeof item.title === 'string' && item.title.length > 0 ? (
                <Small className="leading-snug">{item.title}</Small>
              ) : (
                <Small className="leading-snug font-mediumitalic">
                  Untitled chapter #{index + 1}
                </Small>
              )}
            </View>
          </View>
        </View>
      )}
      ListEmptyComponent={() => (
        <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted">
          <Text className="text-center">No chapters found</Text>
        </View>
      )}
    />
  );
};
