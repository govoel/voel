import { Effect, Layer, Option, Schema, Stream } from 'effect';

import { sql } from '@repo/effect-kysely';
import type { EffectKysely, EffectTransaction } from '@repo/effect-kysely';
import {
  SyncCheckpoint,
  syncPrimaryKeys,
  syncTimestampedTables,
} from '@repo/spec-api/groups/sync.ts';
import type { SyncEvent, SyncRow } from '@repo/spec-api/groups/sync.ts';

import { acquireAccountApiClient } from '#src/services/account-api-client.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import {
  AccountDatabaseKey,
  acquireAccountDatabase,
} from '#src/services/database/account/index.ts';
import type { AccountDatabaseTables } from '#src/services/database/account/schema.ts';

type SyncTable = SyncRow['_tag'];
type SyncTableRow<Table extends SyncTable> = Omit<Extract<SyncRow, { _tag: Table }>, '_tag'>;
type SyncUpdate<Table extends SyncTable> = Omit<
  SyncTableRow<Table>,
  Extract<(typeof syncPrimaryKeys)[Table], keyof SyncTableRow<Table>>
>;

/**
 * Makes Kysely update objects exhaustive over every replicated non-primary-key
 * column. Kysely itself validates mentioned columns but intentionally permits
 * partial updates.
 */
const completeSyncUpdate =
  <Table extends SyncTable>() =>
  <Update extends { [Column in keyof SyncUpdate<Table>]: unknown }>(
    update: Update & Record<Exclude<keyof Update, keyof SyncUpdate<Table>>, never>
  ) =>
    update;

const upsertRow = Effect.fnUntraced(function* (
  db: EffectKysely<AccountDatabaseTables> | EffectTransaction<AccountDatabaseTables>,
  event: SyncRow
) {
  switch (event._tag) {
    case 'mediaType': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('mediaType')
            .values(row)
            .onConflict((conflict) => conflict.column(syncPrimaryKeys.mediaType).doNothing())
        )
        .pipe(Effect.asVoid);
    }
    case 'mediaItem': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('mediaItem')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.mediaItem).doUpdateSet((eb) =>
                completeSyncUpdate<'mediaItem'>()({
                  type: eb.ref('excluded.type'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'audiobook': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('audiobook')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.audiobook).doUpdateSet((eb) =>
                completeSyncUpdate<'audiobook'>()({
                  asin: eb.ref('excluded.asin'),
                  mediaItemId: eb.ref('excluded.mediaItemId'),
                  title: eb.ref('excluded.title'),
                  subtitle: eb.ref('excluded.subtitle'),
                  cover: eb.ref('excluded.cover'),
                  coverThumbhash: eb.ref('excluded.coverThumbhash'),
                  summary: eb.ref('excluded.summary'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'audiobookSeries': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('audiobookSeries')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.audiobookSeries).doUpdateSet((eb) =>
                completeSyncUpdate<'audiobookSeries'>()({
                  asin: eb.ref('excluded.asin'),
                  name: eb.ref('excluded.name'),
                  summary: eb.ref('excluded.summary'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'audiobookSeriesMap': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('audiobookSeriesMap')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.audiobookSeriesMap).doUpdateSet((eb) =>
                completeSyncUpdate<'audiobookSeriesMap'>()({
                  audiobookId: eb.ref('excluded.audiobookId'),
                  audiobookSeriesId: eb.ref('excluded.audiobookSeriesId'),
                  title: eb.ref('excluded.title'),
                  label: eb.ref('excluded.label'),
                  sort: eb.ref('excluded.sort'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'audiobookContributor': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('audiobookContributor')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.audiobookContributor).doUpdateSet((eb) =>
                completeSyncUpdate<'audiobookContributor'>()({
                  asin: eb.ref('excluded.asin'),
                  name: eb.ref('excluded.name'),
                  about: eb.ref('excluded.about'),
                  avatar: eb.ref('excluded.avatar'),
                  avatarThumbhash: eb.ref('excluded.avatarThumbhash'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'audiobookContributorRole': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('audiobookContributorRole')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.audiobookContributorRole).doNothing()
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'audiobookContributorMap': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('audiobookContributorMap')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.audiobookContributorMap).doUpdateSet((eb) =>
                completeSyncUpdate<'audiobookContributorMap'>()({
                  audiobookId: eb.ref('excluded.audiobookId'),
                  audiobookContributorId: eb.ref('excluded.audiobookContributorId'),
                  name: eb.ref('excluded.name'),
                  role: eb.ref('excluded.role'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'library': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('library')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.library).doUpdateSet((eb) =>
                completeSyncUpdate<'library'>()({
                  type: eb.ref('excluded.type'),
                  name: eb.ref('excluded.name'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'libraryPath': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('libraryPath')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.libraryPath).doUpdateSet((eb) =>
                completeSyncUpdate<'libraryPath'>()({
                  libraryId: eb.ref('excluded.libraryId'),
                  absolutePath: eb.ref('excluded.absolutePath'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'mediaFile': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('mediaFile')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.mediaFile).doUpdateSet((eb) =>
                completeSyncUpdate<'mediaFile'>()({
                  absolutePath: eb.ref('excluded.absolutePath'),
                  durationMs: eb.ref('excluded.durationMs'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    case 'libraryFileMap': {
      const { _tag, ...row } = event;
      return yield* db
        .execute(
          db
            .insertInto('libraryFileMap')
            .values(row)
            .onConflict((conflict) =>
              conflict.column(syncPrimaryKeys.libraryFileMap).doUpdateSet((eb) =>
                completeSyncUpdate<'libraryFileMap'>()({
                  libraryId: eb.ref('excluded.libraryId'),
                  mediaFileId: eb.ref('excluded.mediaFileId'),
                  mediaItemId: eb.ref('excluded.mediaItemId'),
                  matchFailureReason: eb.ref('excluded.matchFailureReason'),
                  variant: eb.ref('excluded.variant'),
                  customOrder: eb.ref('excluded.customOrder'),
                  createdAt: eb.ref('excluded.createdAt'),
                  updatedAt: eb.ref('excluded.updatedAt'),
                  deletedAt: eb.ref('excluded.deletedAt'),
                })
              )
            )
        )
        .pipe(Effect.asVoid);
    }
    default: {
      const unhandledEvent: never = event;
      return yield* Effect.die(unhandledEvent);
    }
  }
});

export const applySyncRow = Effect.fnUntraced(function* (
  db: EffectKysely<AccountDatabaseTables>,
  event: SyncRow
) {
  yield* upsertRow(db, event);
});

const getCheckpoints = Effect.fnUntraced(function* (db: EffectKysely<AccountDatabaseTables>) {
  const entries = yield* Effect.forEach(
    syncTimestampedTables,
    Effect.fnUntraced(function* (table) {
      const result = yield* db.executeRaw(
        sql<{ readonly value: number | null }>`
          select max(updatedAt) as value from ${sql.table(table)}
        `
      );
      return [table, result.rows[0]?.value ?? 0] as const;
    }),
    { concurrency: 'unbounded' }
  );

  return yield* Schema.decodeUnknownEffect(SyncCheckpoint)(Object.fromEntries(entries)).pipe(
    Effect.orDie
  );
});

const synchronizeOnce = Effect.fnUntraced(function* (
  account: ActiveAccountKey,
  db: EffectKysely<AccountDatabaseTables>
) {
  const client = yield* acquireAccountApiClient(account);
  const checkpoints = yield* getCheckpoints(db);
  const history: Array<SyncRow> = [];

  const flushHistory = Effect.fnUntraced(function* () {
    if (history.length === 0) {
      return;
    }
    const pending = history.splice(0);
    yield* db.trx().execute(
      Effect.fnUntraced(function* (trx) {
        yield* Effect.forEach(pending, (event) => upsertRow(trx, event), { discard: true });
      })
    );
  });

  yield* client('sync', checkpoints).pipe(
    Stream.runForEach(
      Effect.fnUntraced(function* (event: SyncEvent) {
        if (event.type === 'history') {
          history.push(event.payload);
          if (history.length >= 999) {
            yield* flushHistory();
          }
        } else if (event.type === 'historyComplete') {
          yield* flushHistory();
        } else {
          yield* flushHistory();
          yield* applySyncRow(db, event.payload);
        }
      })
    )
  );
  yield* flushHistory();
});

const synchronizeAccount = Effect.fnUntraced(function* (account: ActiveAccountKey) {
  const db = yield* acquireAccountDatabase(
    new AccountDatabaseKey({ serverUrl: account.serverUrl, userId: account.userId })
  );

  return yield* Effect.scoped(synchronizeOnce(account, db)).pipe(
    Effect.catch((error) => Effect.logWarning('Account synchronization disconnected', error)),
    Effect.andThen(Effect.sleep('1 second')),
    Effect.forever
  );
});

export const AccountSyncLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const manager = yield* AccountManager;
    yield* Stream.concat(Stream.fromEffect(manager.state), manager.changes).pipe(
      Stream.switchMap((account) =>
        Option.match(account, {
          onNone: () => Stream.never,
          onSome: (activeAccount) =>
            Stream.fromEffect(Effect.scoped(synchronizeAccount(activeAccount))),
        })
      ),
      Stream.runDrain,
      Effect.forkScoped({ startImmediately: true })
    );
  })
);
