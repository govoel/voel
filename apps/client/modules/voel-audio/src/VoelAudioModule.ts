import {
  type AudioDownloadStatus,
  type AudioSource,
  type AudioStatus,
  type PlaybackHistoryUpdateEvent,
  VoelAudioModule,
} from './VoelAudio.types';
import { requireNativeModule, useEvent, useEventListener } from 'expo';
import { produce } from 'immer';
import { useEffect, useMemo, useState } from 'react';

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

export function useDownloadStatus(
  instanceId: string,
  fileIds: number[] = []
): Record<string, AudioDownloadStatus> {
  const fileIdsString = fileIds.join(',');
  const stringifiedFileIds = useMemo(() => {
    return fileIds.map((id) => id.toString());
  }, [fileIdsString]);

  const [downloads, setDownloads] = useState(() => {
    return fileIds.length === 0
      ? NativeVoelAudioModule.getAllDownloads(instanceId)
      : NativeVoelAudioModule.getDownloads(instanceId, stringifiedFileIds);
  });

  useEventListener(NativeVoelAudioModule, 'downloadStatusUpdate', ({ events }) => {
    setDownloads(
      produce((draft) => {
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
              } else if (
                stringifiedFileIds.includes(downloadId) ||
                stringifiedFileIds.length === 0
              ) {
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

  useEffect(() => {
    setDownloads(
      stringifiedFileIds.length === 0
        ? NativeVoelAudioModule.getAllDownloads(instanceId)
        : NativeVoelAudioModule.getDownloads(instanceId, stringifiedFileIds)
    );
  }, [instanceId, stringifiedFileIds]);

  return downloads;
}

export default NativeVoelAudioModule;
