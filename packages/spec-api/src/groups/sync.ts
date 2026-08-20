import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { DatabaseSqlError } from '@repo/effect-kysely';

import {
  Audiobook,
  AudiobookContributor,
  AudiobookContributorMap,
  AudiobookContributorRole,
  AudiobookSeries,
  AudiobookSeriesMap,
  Library,
  LibraryFileMap,
  LibraryPath,
  MediaFile,
  MediaItem,
  MediaType,
} from '#src/database/schema.ts';
import type { DatabaseTables } from '#src/database/schema.ts';
import { AuthMiddleware } from '#src/middlewares/auth.ts';

export const syncTimestampedTables = [
  'mediaItem',
  'audiobook',
  'audiobookSeries',
  'audiobookSeriesMap',
  'audiobookContributor',
  'audiobookContributorMap',
  'library',
  'libraryPath',
  'mediaFile',
  'libraryFileMap',
] as const;

export const syncStaticTables = ['mediaType', 'audiobookContributorRole'] as const;

export const syncTables = [...syncStaticTables, ...syncTimestampedTables] as const;

type AssertNever<Value extends never> = Value;
export type MissingSyncTables = AssertNever<
  Exclude<keyof DatabaseTables, (typeof syncTables)[number]>
>;

export const syncPrimaryKeys = {
  mediaType: 'type',
  mediaItem: 'id',
  audiobook: 'id',
  audiobookSeries: 'id',
  audiobookSeriesMap: 'id',
  audiobookContributor: 'id',
  audiobookContributorRole: 'role',
  audiobookContributorMap: 'id',
  library: 'id',
  libraryPath: 'id',
  mediaFile: 'id',
  libraryFileMap: 'id',
} as const satisfies Record<keyof DatabaseTables, string>;

export const SyncCheckpoint = Schema.Struct({
  mediaItem: Schema.Natural,
  audiobook: Schema.Natural,
  audiobookSeries: Schema.Natural,
  audiobookSeriesMap: Schema.Natural,
  audiobookContributor: Schema.Natural,
  audiobookContributorMap: Schema.Natural,
  library: Schema.Natural,
  libraryPath: Schema.Natural,
  mediaFile: Schema.Natural,
  libraryFileMap: Schema.Natural,
});

export const SyncRow = Schema.Union(
  [
    Schema.Struct({ table: Schema.Literal('mediaType'), row: MediaType.json }),
    Schema.Struct({ table: Schema.Literal('mediaItem'), row: MediaItem.json }),
    Schema.Struct({ table: Schema.Literal('audiobook'), row: Audiobook.json }),
    Schema.Struct({
      table: Schema.Literal('audiobookSeries'),
      row: AudiobookSeries.json,
    }),
    Schema.Struct({
      table: Schema.Literal('audiobookSeriesMap'),
      row: AudiobookSeriesMap.json,
    }),
    Schema.Struct({
      table: Schema.Literal('audiobookContributor'),
      row: AudiobookContributor.json,
    }),
    Schema.Struct({
      table: Schema.Literal('audiobookContributorRole'),
      row: AudiobookContributorRole.json,
    }),
    Schema.Struct({
      table: Schema.Literal('audiobookContributorMap'),
      row: AudiobookContributorMap.json,
    }),
    Schema.Struct({ table: Schema.Literal('library'), row: Library.json }),
    Schema.Struct({ table: Schema.Literal('libraryPath'), row: LibraryPath.json }),
    Schema.Struct({ table: Schema.Literal('mediaFile'), row: MediaFile.json }),
    Schema.Struct({
      table: Schema.Literal('libraryFileMap'),
      row: LibraryFileMap.json,
    }),
  ],
  { mode: 'oneOf' }
);

export const SyncEvent = Schema.Union(
  [
    Schema.Struct({ type: Schema.Literal('history'), payload: SyncRow }),
    Schema.Struct({ type: Schema.Literal('historyComplete') }),
    Schema.Struct({ type: Schema.Literal('live'), payload: SyncRow }),
  ],
  { mode: 'oneOf' }
);

export type SyncEvent = typeof SyncEvent.Type;
export type SyncRow = typeof SyncRow.Type;
export type SyncCheckpoint = typeof SyncCheckpoint.Type;

export class SyncSlowConsumerError extends Schema.TaggedError<
  SyncSlowConsumerError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/sync/SyncSlowConsumerError')('SyncSlowConsumerError', {
  capacity: Schema.Natural,
}) {}

export const SyncRpcs = RpcGroup.make(
  Rpc.make('sync', {
    payload: SyncCheckpoint,
    success: SyncEvent,
    error: Schema.Union([DatabaseSqlError, SyncSlowConsumerError], { mode: 'oneOf' }),
    stream: true,
  })
).middleware(AuthMiddleware);
