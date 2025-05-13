import { useMutation } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';
import { type ReactNode, createContext, use, useEffect } from 'react';
import { toast } from 'sonner-native';

import { instanceStore } from '~/lib/stores/instance';

import Player, { type PlaybackHistoryUpdateEvent, usePlaybackHistory } from '~/modules/voel-audio';

const PlaybackHistoryContext = createContext<PlaybackHistoryUpdateEvent>({
  instanceID: '0',
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
  const instanceID = useSelector(instanceStore, (state) => state.context.instanceID);
  const apiInstance = useSelector(instanceStore, (state) => state.context.apiInstance);

  const playbackHistory = usePlaybackHistory(instanceID ?? '0');
  const { mutate: playbackHistoryMutation } = useMutation(
    apiInstance.v1.sync.playbackHistory.mutationOptions({
      onSuccess: async (data) => {
        Player.deletePlaybackHistoryOlderThan(instanceID ?? '0', data);
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
    if (
      playbackHistory.instanceID !== '0' &&
      playbackHistory.instanceID === instanceID &&
      playbackHistory.events.length > 0
    ) {
      playbackHistoryMutation(playbackHistory.events);
    }
  }, [playbackHistory, instanceID, playbackHistoryMutation]);

  return (
    <PlaybackHistoryContext
      value={{ instanceID: playbackHistory.instanceID, events: playbackHistory.events }}>
      {children}
    </PlaybackHistoryContext>
  );
};
