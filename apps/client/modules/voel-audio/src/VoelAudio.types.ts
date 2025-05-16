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
  getLastPlaybackHistoryEvent(instanceID: string): PlaybackHistoryUpdateEvent;
  startPlaybackHistoryUpdates(instanceID: string): void;
  deletePlaybackHistoryOlderThan(instanceID: string, timestamp: number): Promise<void>;
  play(): void;
  pause(): void;
  setCookie(cookie: string): void;
  replace(sources: AudioSource[], startIndex: number, startPositionMs: number): void;
  getCurrentQueue(): AudioSource[];
  clearQueue(): void;
  canSkipToNext(): boolean;
  skipToNext(): void;
  skipToPrevious(): void;
  setPlaybackRate(rate: number): void;
}

export type AudioEvents = {
  playbackStatusUpdate(status: AudioStatus): void;
  playbackHistoryUpdate(events: PlaybackHistoryUpdateEvent): void;
};
