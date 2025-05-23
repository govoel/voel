import {
  type AudioSource,
  type AudioStatus,
  type PlaybackHistoryUpdateEvent,
  VoelAudioModule,
} from './VoelAudio.types';
import { requireNativeModule, useEvent } from 'expo';
import { useEffect } from 'react';

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

export default NativeVoelAudioModule;
