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
} as const satisfies {
  [Table in keyof DatabaseTables]: keyof DatabaseTables[Table] & string;
};

export class SyncCheckpoint extends Schema.Class<SyncCheckpoint, { readonly brand: unique symbol }>(
  '@repo/spec-api/groups/sync/SyncCheckpoint'
)({
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
}) {}

export const SyncRow = Schema.Union(
  [
    Schema.TaggedStruct('mediaType', MediaType.json.fields),
    Schema.TaggedStruct('mediaItem', MediaItem.json.fields),
    Schema.TaggedStruct('audiobook', Audiobook.json.fields),
    Schema.TaggedStruct('audiobookSeries', AudiobookSeries.json.fields),
    Schema.TaggedStruct('audiobookSeriesMap', AudiobookSeriesMap.json.fields),
    Schema.TaggedStruct('audiobookContributor', AudiobookContributor.json.fields),
    Schema.TaggedStruct('audiobookContributorRole', AudiobookContributorRole.json.fields),
    Schema.TaggedStruct('audiobookContributorMap', AudiobookContributorMap.json.fields),
    Schema.TaggedStruct('library', Library.json.fields),
    Schema.TaggedStruct('libraryPath', LibraryPath.json.fields),
    Schema.TaggedStruct('mediaFile', MediaFile.json.fields),
    Schema.TaggedStruct('libraryFileMap', LibraryFileMap.json.fields),
  ],
  { mode: 'oneOf' }
).pipe(Schema.toTaggedUnion('_tag'));

export type SyncRow = typeof SyncRow.Type;

type SyncTable = SyncRow['_tag'];
type SyncTableRow<Table extends SyncTable> = Omit<Extract<SyncRow, { _tag: Table }>, '_tag'>;

/**
 * The exact database projection exposed by sync. Keeping this separate from
 * `select *` makes every protocol column an explicit decision.
 */
export const syncColumns = {
  mediaType: ['type'],
  mediaItem: ['id', 'type', 'createdAt', 'updatedAt', 'deletedAt'],
  audiobook: [
    'id',
    'asin',
    'mediaItemId',
    'title',
    'subtitle',
    'cover',
    'coverThumbhash',
    'summary',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
  audiobookSeries: ['id', 'asin', 'name', 'summary', 'createdAt', 'updatedAt', 'deletedAt'],
  audiobookSeriesMap: [
    'id',
    'audiobookId',
    'audiobookSeriesId',
    'title',
    'label',
    'sort',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
  audiobookContributor: [
    'id',
    'asin',
    'name',
    'about',
    'avatar',
    'avatarThumbhash',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
  audiobookContributorRole: ['role'],
  audiobookContributorMap: [
    'id',
    'audiobookId',
    'audiobookContributorId',
    'name',
    'role',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
  library: ['id', 'type', 'name', 'createdAt', 'updatedAt', 'deletedAt'],
  libraryPath: ['id', 'libraryId', 'absolutePath', 'createdAt', 'updatedAt', 'deletedAt'],
  mediaFile: ['id', 'absolutePath', 'durationMs', 'createdAt', 'updatedAt', 'deletedAt'],
  libraryFileMap: [
    'id',
    'libraryId',
    'mediaFileId',
    'mediaItemId',
    'matchFailureReason',
    'variant',
    'customOrder',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ],
} as const satisfies {
  [Table in SyncTable]: ReadonlyArray<keyof SyncTableRow<Table> & string>;
};

export type MissingSyncColumns = AssertNever<
  {
    [Table in SyncTable]: Exclude<keyof SyncTableRow<Table>, (typeof syncColumns)[Table][number]>;
  }[SyncTable]
>;

export const SyncEvent = Schema.Union(
  [
    Schema.Struct({ type: Schema.Literal('history'), payload: SyncRow }),
    Schema.Struct({ type: Schema.Literal('historyComplete') }),
    Schema.Struct({ type: Schema.Literal('live'), payload: SyncRow }),
  ],
  { mode: 'oneOf' }
);

export type SyncEvent = typeof SyncEvent.Type;

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
