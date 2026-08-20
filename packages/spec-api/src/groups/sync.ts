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

const row = <Table extends string, Fields extends Schema.Struct.Fields>(
  table: Table,
  fields: Fields
) => Schema.Struct({ table: Schema.Literal(table), row: Schema.Struct(fields) });

const rows = <Table extends string, Fields extends Schema.Struct.Fields>(
  table: Table,
  fields: Fields
) => Schema.Struct({ table: Schema.Literal(table), rows: Schema.Array(Schema.Struct(fields)) });

export const SyncRow = Schema.Union(
  [
    row('mediaType', MediaType.json.fields),
    row('mediaItem', MediaItem.json.fields),
    row('audiobook', Audiobook.json.fields),
    row('audiobookSeries', AudiobookSeries.json.fields),
    row('audiobookSeriesMap', AudiobookSeriesMap.json.fields),
    row('audiobookContributor', AudiobookContributor.json.fields),
    row('audiobookContributorRole', AudiobookContributorRole.json.fields),
    row('audiobookContributorMap', AudiobookContributorMap.json.fields),
    row('library', Library.json.fields),
    row('libraryPath', LibraryPath.json.fields),
    row('mediaFile', MediaFile.json.fields),
    row('libraryFileMap', LibraryFileMap.json.fields),
  ],
  { mode: 'oneOf' }
);

export const SyncRows = Schema.Union(
  [
    rows('mediaType', MediaType.json.fields),
    rows('mediaItem', MediaItem.json.fields),
    rows('audiobook', Audiobook.json.fields),
    rows('audiobookSeries', AudiobookSeries.json.fields),
    rows('audiobookSeriesMap', AudiobookSeriesMap.json.fields),
    rows('audiobookContributor', AudiobookContributor.json.fields),
    rows('audiobookContributorRole', AudiobookContributorRole.json.fields),
    rows('audiobookContributorMap', AudiobookContributorMap.json.fields),
    rows('library', Library.json.fields),
    rows('libraryPath', LibraryPath.json.fields),
    rows('mediaFile', MediaFile.json.fields),
    rows('libraryFileMap', LibraryFileMap.json.fields),
  ],
  { mode: 'oneOf' }
);

export const SyncEvent = Schema.Union(
  [
    Schema.Struct({ type: Schema.Literal('history'), payload: SyncRow }),
    Schema.Struct({ type: Schema.Literal('historyComplete') }),
    Schema.Struct({ type: Schema.Literal('live'), payload: SyncRows }),
  ],
  { mode: 'oneOf' }
);

export type SyncEvent = typeof SyncEvent.Type;
export type SyncRow = typeof SyncRow.Type;
export type SyncRows = typeof SyncRows.Type;
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
