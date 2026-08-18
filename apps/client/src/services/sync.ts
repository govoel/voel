import { Effect, Layer, Option, Schema, Stream } from 'effect';

import { sql } from '@repo/effect-kysely';
import type { EffectKysely, EffectTransaction } from '@repo/effect-kysely';
import {
  SyncCheckpoint,
  syncPrimaryKeys,
  syncTimestampedTables,
} from '@repo/spec-api/groups/sync.ts';
import type { SyncEvent, SyncRow, SyncRows } from '@repo/spec-api/groups/sync.ts';

import { acquireAccountApiClient } from '#src/services/account-api-client.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import {
  AccountDatabaseKey,
  acquireAccountDatabase,
} from '#src/services/database/account/index.ts';
import type { AccountDatabaseTables } from '#src/services/database/account/schema.ts';

const upsertRow = Effect.fnUntraced(function* (
  db: EffectKysely<AccountDatabaseTables> | EffectTransaction<AccountDatabaseTables>,
  table: SyncRow['table'],
  row: Readonly<Record<string, unknown>>
) {
  const columns = Object.keys(row);
  const key = syncPrimaryKeys[table];
  const updateColumns = columns.filter((column) => column !== key);
  const conflict =
    updateColumns.length === 0
      ? sql`do nothing`
      : sql`do update set ${sql.join(
          updateColumns.map((column) => sql`${sql.ref(column)} = ${sql.ref(`excluded.${column}`)}`)
        )}`;

  yield* db.executeRaw(sql`
    insert into ${sql.table(table)} (${sql.join(columns.map((column) => sql.ref(column)))})
    values (${sql.join(columns.map((column) => row[column]))})
    on conflict (${sql.ref(key)}) ${conflict}
  `);
});

export const applySyncRows = Effect.fnUntraced(function* (
  db: EffectKysely<AccountDatabaseTables>,
  event: SyncRows
) {
  yield* db.trx().execute(
    Effect.fnUntraced(function* (trx) {
      yield* Effect.forEach(event.rows, (row) => upsertRow(trx, event.table, row), {
        discard: true,
      });
    })
  );
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
        yield* Effect.forEach(pending, (event) => upsertRow(trx, event.table, event.row), {
          discard: true,
        });
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
          yield* applySyncRows(db, event.payload);
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
