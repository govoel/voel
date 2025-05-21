import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AutoMarquee } from '~/components/auto-marquee';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { Pause } from '~/lib/icons/Pause';
import { Play } from '~/lib/icons/Play';
import { SkipBack } from '~/lib/icons/SkipBack';
import { SkipForward } from '~/lib/icons/SkipForward';

import Player, { useAudioPlayerStatus } from '~/modules/voel-audio';

const formatTime = (timeMs: number) => {
  const sec = Math.floor(timeMs / 1000);
  const s = sec % 60;
  const m = Math.floor((sec % 3600) / 60);
  const h = Math.floor(sec / 3600);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function PlayerScreen() {
  const router = useRouter();

  const playerStatus = useAudioPlayerStatus();
  const currentQueue = Player.getCurrentQueue();
  const currentItem = currentQueue[playerStatus.currentQueueIndex ?? 0];

  return (
    <BottomSheet
      enableDynamicSizing={false}
      snapPoints={['95%']}
      onChange={(i) => {
        if (i === -1) {
          router.back();
        }
      }}>
      <View className="px-6">
        <View className="py-1">
          <View className="flex justify-center items-center">
            <Muted className="leading-snug">Playing book</Muted>
            <AutoMarquee className="flex justify-center items-center" spacing={20} speed={0.3}>
              <Text>{currentItem.bookTitle}</Text>
            </AutoMarquee>
          </View>

          <AspectRatio className="pt-4" ratio={1 / 1}>
            <Image className="w-full h-full rounded-md" source={currentItem.artworkUri} />
          </AspectRatio>

          <AutoMarquee className="flex justify-center items-center pt-4">
            <Large>{currentItem.chapterTitle}</Large>
          </AutoMarquee>
          <AutoMarquee className="flex justify-center items-center">
            <Muted>{currentItem.author}</Muted>
          </AutoMarquee>

          <View className="pt-4">
            <Slider
              minimumValue={0}
              maximumValue={playerStatus.duration * 1000}
              value={playerStatus.currentTime * 1000}
            />
            <View className="flex flex-row justify-between">
              <Muted>{formatTime(playerStatus.currentTime * 1000)}</Muted>
              <Muted>{formatTime(playerStatus.duration * 1000)}</Muted>
            </View>
          </View>

          <View className="flex flex-row justify-between items-center pt-4">
            <Button
              variant="ghost"
              size="icon"
              onPress={() => Player.skipToPrevious()}
              disabled={!Player.canSkipToPrevious()}>
              <SkipBack className="h-full text-foreground fill-foreground group-active:opacity-80" />
            </Button>
            {playerStatus.playbackState === 'ready' ? (
              <View className="h-10 w-10 flex items-center justify-center">
                <Spinner size={5} />
              </View>
            ) : playerStatus.timeControlStatus === 'paused' ? (
              <Button variant="secondary" size="icon" onPress={() => Player.play()}>
                <Play className="h-full text-transparent fill-foreground group-active:opacity-80" />
              </Button>
            ) : (
              <Button variant="secondary" size="icon" onPress={() => Player.pause()}>
                <Pause className="h-full text-transparent fill-foreground group-active:opacity-80" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onPress={() => Player.skipToNext()}
              disabled={!Player.canSkipToNext()}>
              <SkipForward className="h-full text-foreground fill-foreground group-active:opacity-80" />
            </Button>
            <Text>{playerStatus.playbackRate}x</Text>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
