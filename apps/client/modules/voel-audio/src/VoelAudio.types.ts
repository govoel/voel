import { NativeModule } from 'expo';

export type AudioSource = {
  instanceId: string | null;
  bookId: number;
  chapterId: number;
  bookTitle: string;
  chapterTitle: string;
  author: string;
  fileIds: number[];
  fileUris: string[];
  fileDurations: number[];
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

export type PlaybackHistory = {
  id: number;
  type: number;
  bookId: number;
  positionMs: number;
  eventTimestampMs: number;
};

export type PlaybackHistoryUpdateEvent = {
  instanceID: string;
  events: PlaybackHistory[];
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
  canSkipToNext(): boolean;
  skipToNext(): void;
  skipToPrevious(): void;
  seekTo(mediaItemIndex: number, positionMs: number): void;
  setPlaybackRate(rate: number): void;
  startPlaybackHistoryUpdates(instanceID: string): void;
  deletePlaybackHistoryOlderThan(instanceID: string, timestamp: number): Promise<void>;
}

export type AudioEvents = {
  playbackStatusUpdate(status: AudioStatus): void;
  playbackHistoryUpdate(events: PlaybackHistoryUpdateEvent): void;
};
