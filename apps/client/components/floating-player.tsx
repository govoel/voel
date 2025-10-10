import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { reloadAsync, useUpdates } from 'expo-updates';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { AutoMarquee } from '~/components/auto-marquee';
import { Pause } from '~/components/icons/Pause';
import { Play } from '~/components/icons/Play';
import { SkipForward } from '~/components/icons/SkipForward';
import { Spinner } from '~/components/spinner';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Muted } from '~/components/ui/typography';

import { cn } from '~/lib/utils';

import Player, { useAudioPlayerStatus } from '~/modules/voel-audio';

export const floatingPlayerStore = createStore({
  context: {
    isPlayerActive: false,
    isUpdatePending: false,
  },
  on: {
    setIsPlayerActive: (context, event: { isPlayerActive: boolean }) => {
      if (context.isPlayerActive === event.isPlayerActive) return context;

      return {
        ...context,
        isPlayerActive: event.isPlayerActive,
      };
    },
    setIsUpdatePending: (context, event: { isUpdatePending: boolean }) => {
      if (context.isUpdatePending === event.isUpdatePending) return context;

      return {
        ...context,
        isUpdatePending: event.isUpdatePending,
      };
    },
  },
});

export function useFloatingPlayerPaddingClass() {
  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  if (isPlayerActive && isUpdatePending) return 'pt-6 pb-40 px-6';
  if (isPlayerActive) return 'pt-6 pb-24 px-6';
  if (isUpdatePending) return 'pt-6 pb-20 px-6';
  return 'p-6';
}

export function FloatingPlayerDodgingScrollView({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  const tabBarHeight = useBottomTabBarHeight();

  return (
    <ScrollView className="px-6">
      <View
        className={cn(
          isPlayerActive && isUpdatePending
            ? 'pb-40 pt-6'
            : isPlayerActive
              ? 'pb-24 pt-6'
              : isUpdatePending
                ? 'pb-20 pt-6'
                : 'py-6',
          className
        )}
        style={{ marginBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }}>
        {children}
      </View>
    </ScrollView>
  );
}

export function OTAUpdateNotification({ className }: { className?: string }) {
  const { isUpdatePending } = useUpdates();

  // Sync global store after render; avoid triggering updates during render
  useEffect(() => {
    floatingPlayerStore.trigger.setIsUpdatePending({ isUpdatePending });
  }, [isUpdatePending]);

  if (!isUpdatePending) return null;

  return <OTAUpdateNotificationImpl className={className} />;
}

function OTAUpdateNotificationImpl({ className }: { className?: string }) {
  return (
    <View className={cn(className, 'w-full bg-transparent px-4 pb-2')}>
      <View className="flex max-h-14 w-full flex-row flex-nowrap items-center justify-between overflow-hidden rounded-md bg-muted px-4 py-2">
        <View>
          <Text>New update is available</Text>
        </View>

        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            reloadAsync();
          }}>
          <Text>Reload App</Text>
        </Button>
      </View>
    </View>
  );
}

export function FloatingPlayer({ className }: { className?: string }) {
  const playerStatus = useAudioPlayerStatus();
  const currentQueue = Player.getCurrentQueue();
  const currentTrack =
    playerStatus && currentQueue.length > 0
      ? currentQueue[playerStatus?.currentQueueIndex ?? 0]
      : null;

  const shouldRenderPlayer = playerStatus && currentTrack !== null;

  // Sync global store after render; avoid triggering updates during render
  useEffect(() => {
    floatingPlayerStore.trigger.setIsPlayerActive({ isPlayerActive: shouldRenderPlayer });
  }, [shouldRenderPlayer]);

  if (!shouldRenderPlayer) {
    return null;
  }

  return (
    <FloatingPlayerImpl
      className={className}
      currentTrack={{
        artworkUri: currentTrack.artworkUri,
        chapterTitle: currentTrack.chapterTitle,
        author: currentTrack.author,
      }}
      playerStatus={{
        errorCode: playerStatus.errorCode,
        duration: playerStatus.duration,
        currentTime: playerStatus.currentTime,
        playbackRate: +playerStatus.playbackRate.toFixed(1),
        playbackState: playerStatus.playbackState,
        timeControlStatus: playerStatus.timeControlStatus,
        isBuffering: playerStatus.isBuffering,
      }}
    />
  );
}

const errorMessages = {
  '-2': 'Invalid player state. Please try again.',
  '-3': 'Invalid argument provided.',
  '-4': 'Permission denied.',
  '-6': 'Operation not supported.',
  '-100': 'Component disconnected. Please check connection.',
  '-102': 'Authentication expired. Please log in again.',
  '-103': 'Premium account required to play this content.',
  '-104': 'Too many concurrent streams. Please stop playback on other devices.',
  '-105': 'Content blocked by parental controls.',
  '-106': 'Content not available in your region.',
  '-107': 'Skip limit reached.',
  '-108': 'Playback requires user setup.',
  '-109': 'End of playlist reached.',
  '-110': 'This content is already playing elsewhere.',
  '1000': 'An unknown playback error occurred.',
  '1001': 'A remote playback error occurred.',
  '1002': 'Playback fell behind the live stream.',
  '1003': 'The operation timed out. Please try again.',
  '1004': 'A runtime error occurred during playback.',
  '2000': 'An I/O error occurred.',
  '2001': 'Network connection failed. Please check your internet connection.',
  '2002': 'Network connection timed out. Please try again.',
  '2003': 'Received invalid content type from server.',
  '2004': 'Server returned an error. Please try again later.',
  '2005': 'File not found.',
  '2006': 'Permission denied for I/O operation.',
  '2007': 'Cleartext network traffic not permitted.',
  '2008': 'Error reading data: position out of range.',
  '3001': 'Error parsing media container.',
  '3002': 'Error parsing media manifest.',
  '3003': 'Unsupported media container format.',
  '3004': 'Unsupported feature in media manifest.',
  '4001': 'Failed to initialize media decoder.',
  '4002': 'Failed to query media decoder.',
  '4003': 'Failed to decode media.',
  '4004': 'Media format exceeds device capabilities.',
  '4005': 'Unsupported media format.',
  '4006': 'Decoding resources were reclaimed by the system.',
  '5001': 'Failed to initialize audio track.',
  '5002': 'Failed to write to audio track.',
  '5003': 'Failed to write to offload audio track.',
  '5004': 'Failed to initialize offload audio track.',
  '6000': 'An unknown DRM error occurred.',
  '6001': 'DRM scheme not supported by this device.',
  '6002': 'DRM provisioning failed.',
  '6003': 'DRM content error. Check license configuration.',
  '6004': 'Failed to acquire DRM license.',
  '6005': 'DRM license policy prevents this operation.',
  '6006': 'DRM system error.',
  '6007': 'DRM privileges revoked on this device.',
  '6008': 'DRM license has expired.',
  '7000': 'Failed to initialize video frame processor.',
  '7001': 'Failed to process video frame.',
} as const;

const getNextPlaybackRate = (currentRate: number): number => {
  const rates = [0.5, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0];
  const index = rates.findIndex((rate) => currentRate < rate);
  return rates[index === -1 ? 0 : index];
};

function FloatingPlayerImpl({
  className,
  currentTrack,
  playerStatus,
}: {
  className?: string;
  currentTrack: { artworkUri: string | null; chapterTitle: string; author: string };
  playerStatus: {
    errorCode: number | null;
    duration: number;
    currentTime: number;
    playbackRate: number;
    playbackState: string;
    timeControlStatus: string;
    isBuffering: boolean;
  };
}) {
  useEffect(() => {
    if (playerStatus?.errorCode !== null) {
      const errorCodeStr = playerStatus.errorCode.toString();
      toast.error('Playback failed', {
        description:
          errorCodeStr in errorMessages
            ? errorMessages[errorCodeStr as keyof typeof errorMessages]
            : `Unknown error (${playerStatus.errorCode})`,
      });
    }
  }, [playerStatus?.errorCode]);

  const playerProgress = useDerivedValue(() => {
    if (playerStatus && playerStatus.duration > 0) {
      return (playerStatus.currentTime / playerStatus.duration) * 100;
    }
    return 0;
  });

  const animatedProgress = useAnimatedStyle(() => ({
    width: withTiming(`${playerProgress.value}%`, { duration: 300, easing: Easing.linear }),
  }));

  return (
    <View className={cn(className, 'w-full bg-transparent px-4 py-2')}>
      <View className="overflow-hidden rounded-md bg-muted">
        <Link href="/player" asChild push>
          <Pressable className="w-full flex-row flex-nowrap items-center justify-stretch p-2">
            <View className="max-h-12 flex-1 flex-row items-center justify-center gap-x-2">
              {currentTrack.artworkUri ? (
                <AspectRatio ratio={1 / 1} className="h-full">
                  <Image
                    className="h-full w-full rounded-md"
                    source={{ uri: currentTrack.artworkUri }}
                  />
                </AspectRatio>
              ) : null}
              <View className="flex-1">
                <AutoMarquee spacing={20} speed={0.3}>
                  <Text>{currentTrack?.chapterTitle}</Text>
                </AutoMarquee>
                <AutoMarquee spacing={20} speed={0.3}>
                  <Muted>{currentTrack?.author}</Muted>
                </AutoMarquee>
              </View>
            </View>
            <View className="h-full flex-none flex-row items-center justify-center gap-x-1 pl-2 pr-1">
              <Button
                variant="ghost"
                size="icon"
                onPress={() => {
                  Player.setPlaybackRate(getNextPlaybackRate(playerStatus.playbackRate));
                }}>
                <Text>{playerStatus.playbackRate}x</Text>
              </Button>
              {playerStatus.isBuffering ? (
                <View className="flex h-10 w-10 items-center justify-center">
                  <Spinner size={4} />
                </View>
              ) : playerStatus.timeControlStatus === 'paused' ? (
                <Button variant="ghost" size="icon" onPress={() => Player.play()}>
                  <Play className="h-full text-foreground group-active:opacity-80" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" onPress={() => Player.pause()}>
                  <Pause className="h-full text-foreground group-active:opacity-80" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onPress={() => Player.skipToNext()}
                disabled={!Player.canSkipToNext()}>
                <SkipForward className="h-full text-foreground group-active:opacity-80" />
              </Button>
            </View>
          </Pressable>
        </Link>
        <Animated.View className="h-1 bg-foreground/80" style={animatedProgress}></Animated.View>
      </View>
    </View>
  );
}
