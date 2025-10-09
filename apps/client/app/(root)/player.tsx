import {
  BottomSheetFlatList,
  type BottomSheetModal as BottomSheetModalType,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import { Link, useRouter } from 'expo-router';
import { useUnstableNativeVariable } from 'nativewind';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { AutoMarquee } from '~/components/auto-marquee';
import { List } from '~/components/icons/List';
import { Pause } from '~/components/icons/Pause';
import { Play } from '~/components/icons/Play';
import { Redo } from '~/components/icons/Redo';
import { SkipBack } from '~/components/icons/SkipBack';
import { SkipForward } from '~/components/icons/SkipForward';
import { Undo } from '~/components/icons/Undo';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { BottomSheet, BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { cn, formatTime } from '~/lib/utils';

import Player, { type AudioSource, useAudioPlayerStatus } from '~/modules/voel-audio';

const getTotalPlayedMs = (
  currentQueue: AudioSource[],
  currentQueueIndex: number | null,
  currentTimeMs: number
) =>
  currentQueue.reduce(
    (sum, e, i) =>
      sum +
      ((currentQueueIndex ?? 0) === i
        ? currentTimeMs
        : i > (currentQueueIndex ?? 0)
          ? 0
          : (e.endTimeMs ?? 0) - e.startTimeMs),
    0
  );

const getTotalDurationMs = (currentQueue: AudioSource[]) =>
  currentQueue.reduce((sum, e, i) => sum + (e.endTimeMs ?? 0) - e.startTimeMs, 0);

export default function PlayerScreen() {
  const router = useRouter();

  const playerStatus = useAudioPlayerStatus();
  const currentQueue = Player.getCurrentQueue();
  const currentItem = currentQueue[playerStatus.currentQueueIndex ?? 0];

  const [sliderValue, setSliderValue] = useState<number | null>(null);

  const currentTimeMs = sliderValue ?? playerStatus.currentTime * 1000;

  const totalPlayedMs = getTotalPlayedMs(
    currentQueue,
    playerStatus.currentQueueIndex,
    currentTimeMs
  );
  const totalDurationMs = getTotalDurationMs(currentQueue);

  const chapterBottomSheetModalRef = useRef<BottomSheetModalType>(null);

  const [playbackSpeedSliderValue, setPlaybackSpeedSliderValue] = useState<number | null>(null);
  const playbackSpeedBottomSheetModalRef = useRef<BottomSheetModalType>(null);

  return (
    <>
      <BottomSheet
        enableDynamicSizing={true}
        enablePanDownToClose={true}
        enableContentPanningGesture={false}
        onChange={(i) => {
          if (i === -1) {
            router.dismiss();
          }
        }}>
        <BottomSheetScrollView>
          <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 px-6 pb-5 pt-2">
            <View className="flex items-center justify-center">
              <Muted className="leading-snug">Playing book</Muted>
              <AutoMarquee className="flex items-center justify-center" spacing={20} speed={0.3}>
                <Link
                  href={{ pathname: '/book/[bookId]', params: { bookId: currentItem.bookId } }}
                  asChild
                  push>
                  <Text>{currentItem.bookTitle}</Text>
                </Link>
              </AutoMarquee>
            </View>

            <AspectRatio className="mx-12 pt-4" ratio={1 / 1}>
              <Image className="h-full w-full rounded-md" source={currentItem.artworkUri} />
            </AspectRatio>

            <View className="mx-12 mt-4">
              <Progress value={(totalPlayedMs / totalDurationMs) * 100} />
              <View className="flex flex-row justify-between pt-2">
                <Muted>{formatTime(totalPlayedMs)}</Muted>
                <Muted>{formatTime(totalDurationMs)}</Muted>
              </View>
            </View>

            <AutoMarquee className="flex items-center justify-center pt-6" spacing={20} speed={0.3}>
              <Large
                onPress={() => {
                  chapterBottomSheetModalRef.current?.present();
                }}>
                {currentItem.chapterTitle}
              </Large>
            </AutoMarquee>
            <AutoMarquee className="flex items-center justify-center" spacing={20} speed={0.3}>
              <Muted>{currentItem.author}</Muted>
            </AutoMarquee>

            <View className="pt-6">
              <Slider
                style={{
                  marginLeft: Platform.select({ ios: 0, android: -15 }),
                  marginRight: Platform.select({ ios: 0, android: -15 }),
                }}
                thumbTintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
                minimumTrackTintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
                maximumTrackTintColor={`hsl(${useUnstableNativeVariable('--secondary-foreground')})`}
                minimumValue={0}
                maximumValue={playerStatus.duration * 1000}
                value={playerStatus.currentTime * 1000}
                onValueChange={(value) => {
                  setSliderValue(value);
                }}
                onSlidingComplete={(value) => {
                  Player.seekToInCurrentMediaItem(value);
                  setSliderValue(null);
                }}
              />
              <View className="flex flex-row justify-between">
                <Muted>{formatTime(currentTimeMs)}</Muted>
                <Muted>{formatTime(playerStatus.duration * 1000)}</Muted>
              </View>
            </View>

            <View className="flex flex-row items-center justify-between pt-6">
              <Button
                variant="ghost"
                size="icon"
                onPress={() =>
                  Player.seekToInCurrentMediaItem((playerStatus.currentTime - 10) * 1000)
                }
                className="h-14 w-14">
                <Undo className="h-full text-foreground group-active:opacity-80" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => Player.skipToPrevious()}
                disabled={!Player.canSkipToPrevious()}
                className="h-14 w-14">
                <SkipBack className="h-full text-foreground group-active:opacity-80" />
              </Button>
              {playerStatus.playbackState === 'buffering' ? (
                <View className="flex h-16 w-16 items-center justify-center">
                  <Spinner size={10} />
                </View>
              ) : playerStatus.timeControlStatus === 'paused' ? (
                <Button
                  variant="secondary"
                  size="icon"
                  onPress={() => Player.play()}
                  className="h-16 w-16">
                  <Play className="h-full text-foreground group-active:opacity-80" size={40} />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="icon"
                  onPress={() => Player.pause()}
                  className="h-16 w-16">
                  <Pause className="h-full text-foreground group-active:opacity-80" size={40} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onPress={() => Player.skipToNext()}
                disabled={!Player.canSkipToNext()}
                className="h-14 w-14">
                <SkipForward className="h-full text-foreground group-active:opacity-80" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onPress={() =>
                  Player.seekToInCurrentMediaItem((playerStatus.currentTime + 10) * 1000)
                }
                className="h-14 w-14">
                <Redo className="h-full text-foreground group-active:opacity-80" />
              </Button>
            </View>

            <View className="flex flex-row items-center justify-between pt-6">
              <Button
                variant="ghost"
                size="icon"
                onPress={() => {
                  chapterBottomSheetModalRef.current?.present();
                }}
                className="h-14 w-14">
                <List className="h-full text-foreground group-active:opacity-80" />
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  playbackSpeedBottomSheetModalRef.current?.present();
                }}>
                <Text>{playerStatus.playbackRate.toFixed(2)}x</Text>
              </Button>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      <BottomSheetModal
        ref={chapterBottomSheetModalRef}
        snapPoints={['50%']}
        enableDynamicSizing={true}>
        <BottomSheetFlatList
          contentContainerClassName="p-6 mx-auto w-full max-w-[400px]"
          ListHeaderComponent={<Large className="pb-2">Change Chapter</Large>}
          windowSize={5}
          data={currentQueue}
          keyExtractor={(item: AudioSource) => item.chapterId.toString()}
          renderItem={({ item, index }: { item: AudioSource; index: number }) => (
            <Button
              variant="ghost"
              className={cn(
                'native:h-fit h-fit rounded-none border border-b-0 border-foreground/15 bg-secondary/40',
                index === 0 ? 'rounded-t-md' : '',
                index === currentQueue.length - 1 ? 'rounded-b-md border-b' : ''
              )}
              onPress={() => Player.seekToMediaItem(index, 0)}>
              <View className="flex w-full flex-row items-center justify-between">
                <View className="flex flex-1 flex-row flex-nowrap items-center gap-x-2">
                  {(playerStatus.currentQueueIndex ?? 0) === index ? (
                    <Play className="fill-muted-foreground text-muted-foreground" size={20} />
                  ) : (
                    <Play className="text-muted-foreground" size={20} />
                  )}
                  <Text className="flex-1">{item.chapterTitle}</Text>
                </View>
                <Muted>{formatTime(item.startTimeMs)}</Muted>
              </View>
            </Button>
          )}
          extraData={playerStatus.currentQueueIndex}
        />
      </BottomSheetModal>

      <BottomSheetModal
        ref={playbackSpeedBottomSheetModalRef}
        enablePanDownToClose={true}
        enableContentPanningGesture={false}
        enableDynamicSizing={true}>
        <BottomSheetScrollView>
          <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 p-6">
            <Large>Change Playback Speed</Large>

            <View className="pt-4">
              <Text className="pb-2 text-center">
                {(playbackSpeedSliderValue ?? playerStatus.playbackRate).toFixed(2)}x
              </Text>
              <Slider
                style={{
                  marginLeft: Platform.select({ ios: 0, android: -15 }),
                  marginRight: Platform.select({ ios: 0, android: -15 }),
                }}
                thumbTintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
                minimumTrackTintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
                maximumTrackTintColor={`hsl(${useUnstableNativeVariable('--secondary-foreground')})`}
                minimumValue={0}
                maximumValue={3}
                step={0.05}
                value={playerStatus.playbackRate}
                onValueChange={(value) => {
                  setPlaybackSpeedSliderValue(value);
                }}
                onSlidingComplete={(value) => {
                  Player.setPlaybackRate(value);
                  setPlaybackSpeedSliderValue(null);
                }}
              />
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}
