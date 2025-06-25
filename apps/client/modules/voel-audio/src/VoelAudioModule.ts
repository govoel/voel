import {
  type AudioDownloadStatus,
  type AudioSource,
  type AudioStatus,
  type PlaybackHistoryUpdateEvent,
  VoelAudioModule,
} from './VoelAudio.types';
import { useQuery as useReactQuery } from '@tanstack/react-query';
import { requireNativeModule, useEvent, useEventListener } from 'expo';
import { produce } from 'immer';
import { useEffect, useMemo, useState } from 'react';

import { queryClient } from '~/lib/api/query-client';

// This call loads the native module object from the JSI.
const NativeVoelAudioModule = requireNativeModule<VoelAudioModule>('VoelAudio');

export function useAudioPlayerStatus(): AudioStatus {
  return useEvent(
    NativeVoelAudioModule,
    'playbackStatusUpdate',
    NativeVoelAudioModule.currentStatus
  );
}

export function replaceAudioSources(
  cookie: string,
  sources: AudioSource[],
  startIndex: number,
  startPositionMs: number
) {
  NativeVoelAudioModule.setCookie(cookie);
  NativeVoelAudioModule.replace(sources, startIndex, startPositionMs);
}

export function usePlaybackHistory(instanceId: string): PlaybackHistoryUpdateEvent {
  useEffect(() => {
    NativeVoelAudioModule.startPlaybackHistoryUpdates(instanceId);
  }, [instanceId]);
  return useEvent(
    NativeVoelAudioModule,
    'playbackHistoryUpdate',
    NativeVoelAudioModule.getLastPlaybackHistoryEvent(instanceId)
  );
}

export async function deletePlaybackHistoryOlderThen(
  instanceId: string,
  timestamp: number
): Promise<void> {
  return NativeVoelAudioModule.deletePlaybackHistoryOlderThan(instanceId, timestamp);
}

export function useDownloadStatus(instanceId: string, fileIds: number[] = []) {
  const query = useReactQuery({
    queryKey: ['downloadsStatus', { instanceId, fileIds }],
    queryFn: () => {
      if (fileIds.length === 0) {
        return NativeVoelAudioModule.getAllDownloads(instanceId);
      } else {
        return NativeVoelAudioModule.getDownloads(
          instanceId,
          fileIds.map((id) => id.toString())
        );
      }
    },
  });

  useEventListener(NativeVoelAudioModule, 'downloadStatusUpdate', ({ events }) => {
    queryClient.setQueryData(
      ['downloadsStatus', { instanceId, fileIds }],
      produce((draft: Record<string, AudioDownloadStatus>) => {
        for (const event of events) {
          if (event.id.startsWith(`${instanceId}-`)) {
            const downloadId = event.id.split('-').pop();

            if (!downloadId) return;

            if (event.type === 'removed') {
              if (downloadId in draft) {
                delete draft[downloadId];
              }
            } else if (event.type === 'changed') {
              if (downloadId in draft) {
                draft[downloadId].state = event.state;
                draft[downloadId].paused = event.paused;
                draft[downloadId].bytesDownloaded = event.bytesDownloaded;
                draft[downloadId].contentLength = event.contentLength;
                draft[downloadId].percentDownloaded = event.percentDownloaded;
                draft[downloadId].contentLength = event.contentLength;
                draft[downloadId].failureReason = event.failureReason;
                draft[downloadId].isTerminalState = event.isTerminalState;
                draft[downloadId].stopReason = event.stopReason;
                draft[downloadId].startTimeMs = event.startTimeMs;
                draft[downloadId].updateTimeMs = event.updateTimeMs;
              } else if (fileIds.includes(parseInt(downloadId, 10)) || fileIds.length === 0) {
                draft[downloadId] = {
                  id: event.id,
                  state: event.state,
                  paused: event.paused,
                  bytesDownloaded: event.bytesDownloaded,
                  contentLength: event.contentLength,
                  percentDownloaded: event.percentDownloaded,
                  failureReason: event.failureReason,
                  isTerminalState: event.isTerminalState,
                  stopReason: event.stopReason,
                  startTimeMs: event.startTimeMs,
                  updateTimeMs: event.updateTimeMs,
                };
              }
            } else if (event.type === 'progress') {
              if (downloadId in draft) {
                draft[downloadId].bytesDownloaded = event.bytesDownloaded;
                draft[downloadId].contentLength = event.contentLength;
                draft[downloadId].percentDownloaded = event.percentDownloaded;
              }
            }
          }
        }
      })
    );
  });

  useEffect(() => {
    NativeVoelAudioModule.startDownloadUpdates();
  }, []);

  return query;
}

export default NativeVoelAudioModule;
