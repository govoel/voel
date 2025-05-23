import { NativeModule } from 'expo';

export type AudioSource = {
  instanceId: string | null;
  bookId: number;
  chapterId: number;
  bookTitle: string;
  chapterTitle: string;
  author: string;
  files: AudioFile[];
  artworkUri: string | null;
  startTimeMs: number;
  endTimeMs: number | null;
};

export type AudioFile = {
  id: number;
  uri: string;
  durationMs: number;
};

export type AudioDownload = {
  id: number;
  uri: string;
  filePath: string;
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
  instanceId: string;
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
  getLastPlaybackHistoryEvent(instanceId: string): PlaybackHistoryUpdateEvent;
  startPlaybackHistoryUpdates(instanceId: string): void;
  deletePlaybackHistoryOlderThan(instanceId: string, timestamp: number): Promise<void>;
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
  addDownloads(instanceId: string, files: AudioDownload[]): void;
  removeDownloads(instanceId: string, fileIds: number[]): void;
}

export type AudioEvents = {
  playbackStatusUpdate(status: AudioStatus): void;
  playbackHistoryUpdate(events: PlaybackHistoryUpdateEvent): void;
};
