import { useMutation } from '@tanstack/react-query';
import { type ReactNode, createContext, use, useEffect } from 'react';
import { toast } from 'sonner-native';

import { useApiInstance, useInstanceId } from '~/lib/stores/instance';

import Player, { type PlaybackHistoryUpdateEvent, usePlaybackHistory } from '~/modules/voel-audio';

const PlaybackHistoryContext = createContext<PlaybackHistoryUpdateEvent>({
  instanceId: '0',
  events: [],
});

export const usePlaybackHistoryContext = () => {
  const context = use(PlaybackHistoryContext);

  if (!context) {
    throw new Error('usePlaybackHistoryContext must be used within a PlaybackHistoryProvider');
  }

  return context;
};

export const PlaybackHistoryProvider = ({ children }: { children: ReactNode }) => {
  const instanceId = useInstanceId();
  const apiInstance = useApiInstance();

  const playbackHistory = usePlaybackHistory(instanceId);
  const { mutate: playbackHistoryMutation, reset: playbackHistoryMutationReset } = useMutation(
    apiInstance.v1.sync.playbackHistory.mutationOptions({
      retry: Infinity,
      onSuccess: async (data) => {
        Player.deletePlaybackHistoryOlderThan(instanceId, data);
      },
      onError: async (error) => {
        if (!error?.message.includes('java.net.ConnectException')) {
          toast.error('Failed to update playback history', {
            description: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    })
  );

  useEffect(() => {
    playbackHistoryMutationReset();
    if (
      playbackHistory.instanceId !== '0' &&
      playbackHistory.instanceId === instanceId &&
      playbackHistory.events.length > 0
    ) {
      playbackHistoryMutation(playbackHistory.events);
    }
  }, [playbackHistory, instanceId, playbackHistoryMutation, playbackHistoryMutationReset]);

  return (
    <PlaybackHistoryContext
      value={{ instanceId: playbackHistory.instanceId, events: playbackHistory.events }}>
      {children}
    </PlaybackHistoryContext>
  );
};
