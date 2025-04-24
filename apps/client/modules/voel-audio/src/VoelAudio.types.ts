import { NativeModule } from 'expo';

export type AudioSource = {
  instanceId: string | null;
  bookId: number;
  fileId: number;
  chapterId: number;
  bookTitle: string;
  chapterTitle: string;
  author: string;
  fileUri: string;
  artworkUri: string | null;
  startTimeMs: number;
  endTimeMs: number | null;
};

export type AudioStatus = {
  currentTime: number;
  playbackState: string;
  timeControlStatus: string;
  reasonForWaitingToPlay: string;
  mute: boolean;
  duration: number;
  currentQueueIndex: number | null;
  playing: boolean;
  loop: boolean;
  didJustFinish: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  playbackRate: number;
  shouldCorrectPitch: boolean;
  errorCode: number | null;
};

export declare class VoelAudioModule extends NativeModule<AudioEvents> {
  setCookie(cookie: string): void;
  isBuffering: boolean;
  currentStatus: AudioStatus;
  isLoaded: boolean;
  playing: boolean;
  muted: boolean;
  shouldCorrectPitch: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  play(): void;
  pause(): void;
  replace(sources: AudioSource[]): void;
  setQueue(sources: AudioSource[]): void;
  addToQueue(sources: AudioSource[]): void;
  removeFromQueue(tracks: AudioSource[]): void;
  getCurrentQueue(): AudioSource[];
  clearQueue(): void;
  skipToNext(): void;
  skipToPrevious(): void;
  seekTo(seconds: number): void;
  setPlaybackRate(rate: number): void;
}

export type AudioEvents = {
  playbackStatusUpdate(status: AudioStatus): void;
};
