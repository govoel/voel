import { AudioSource, AudioStatus, VoelAudioModule } from './VoelAudio.types';
import { requireNativeModule, useEvent } from 'expo';

// This call loads the native module object from the JSI.
const NativeVoelAudioModule = requireNativeModule<VoelAudioModule>('VoelAudio');

export function useAudioPlayerStatus(): AudioStatus {
  return useEvent(
    NativeVoelAudioModule,
    'playbackStatusUpdate',
    NativeVoelAudioModule.currentStatus
  );
}

export function replaceAudioSources(cookie: string, sources: AudioSource[]) {
  NativeVoelAudioModule.setCookie(cookie);
  NativeVoelAudioModule.replace(sources);
}

export default NativeVoelAudioModule;
