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
  uri: string;
  fileId: number;
  filePath: string;
  bookId: number;
  bookTitle: string;
  bookAuthors: string;
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

export type AudioDownloadStatus = {
  id: string;
  state: number;
  paused: boolean;
  bytesDownloaded: number;
  percentDownloaded: number;
  contentLength: number;
  failureReason: number;
  isTerminalState: boolean;
  stopReason: number;
  startTimeMs: number;
  updateTimeMs: number;
};

export type PlaybackHistory = {
  id: number;
  type: number;
  bookId: number;
  positionMs: number;
  eventTimestampMs: number;
  sessionId: string;
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
  startDownloadUpdates(): void;
  getDownload(fileId: string): AudioDownloadStatus | null;
  getDownloads(instanceId: string, fileIds: string[]): Record<string, AudioDownloadStatus>;
  getAllDownloads(instanceId: string): Record<string, AudioDownloadStatus>;
  addDownloads(instanceId: string, files: AudioDownload[]): void;
  removeDownloads(instanceId: string, fileIds: number[]): void;
  pauseDownloads(): void;
  resumeDownloads(): void;
}

export type AudioEvents = {
  playbackStatusUpdate(status: AudioStatus): void;
  playbackHistoryUpdate(events: PlaybackHistoryUpdateEvent): void;
  downloadStatusUpdate(events: {
    events: (
      | ({ type: 'changed' } & AudioDownloadStatus)
      | ({ type: 'removed' } & Pick<AudioDownloadStatus, 'id'>)
      | ({ type: 'progress' } & Pick<
          AudioDownloadStatus,
          'id' | 'bytesDownloaded' | 'contentLength' | 'percentDownloaded'
        >)
    )[];
  }): void;
};
