/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import BunSqliteDatabase from 'bun:sqlite';

import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { sql } from '@repo/effect-kysely';
import { BunSqliteDialect } from '@repo/effect-kysely/dialect.ts';
import { Library, MediaType } from '@repo/spec-api/database/schema.ts';
import { syncColumns, syncPrimaryKeys, syncTables } from '@repo/spec-api/groups/sync.ts';

import { XxHash } from '#src/services/auth-client/xxhash.ts';
import {
  AccountDatabase,
  AccountDatabaseKey,
  makeAccountDatabaseFilename,
} from '#src/services/database/account/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { applySyncRow } from '#src/services/sync.ts';

it.effect(
  'migrates an account replica and applies sync upserts',
  Effect.fnUntraced(
    function* () {
      const db = yield* AccountDatabase;

      for (const table of syncTables) {
        const result = yield* db.executeRaw(
          sql<{ readonly name: string; readonly pk: number }>`
            select name, pk from pragma_table_info(${table})
            order by cid
          `
        );
        expect(
          result.rows.map((column) => column.name).toSorted((a, b) => a.localeCompare(b))
        ).toEqual(syncColumns[table].toSorted((a, b) => a.localeCompare(b)));
        expect(
          result.rows
            .filter((column) => column.pk > 0)
            .toSorted((a, b) => a.pk - b.pk)
            .map((column) => column.name)
        ).toEqual([syncPrimaryKeys[table]]);
      }

      yield* db.executeRaw(sql`
        insert into library (id, type, name, createdAt, updatedAt, deletedAt)
        values (1, 'audiobook', 'Local replica', 10, 10, null)
      `);

      expect(yield* db.execute(db.selectFrom('library').selectAll())).toMatchObject([
        { id: 1, type: 'audiobook', name: 'Local replica', updatedAt: 10 },
      ]);
      expect(yield* db.execute(db.selectFrom('mediaType').selectAll())).toEqual([]);

      yield* applySyncRow(db, {
        _tag: 'library',
        id: Library.fields.id.make(1),
        type: MediaType.fields.type.make('movie'),
        name: Library.fields.name.make('Live update'),
        createdAt: 10,
        updatedAt: 20,
        deletedAt: null,
      });
      expect(
        yield* db.executeTakeFirstOrUndefined(db.selectFrom('library').selectAll())
      ).toMatchObject({ id: 1, name: 'Live update', type: 'movie', updatedAt: 20 });
    },
    (effect) =>
      effect.pipe(
        Effect.provide(
          AccountDatabase.layer({
            dialect: new BunSqliteDialect({ database: new BunSqliteDatabase(':memory:') }),
          })
        ),
        Effect.scoped
      )
  )
);

it.effect('derives a stable, distinct database filename for each account', () =>
  Effect.gen(function* () {
    const firstAccount = new AccountDatabaseKey({
      serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
      userId: Account.fields.userId.make('first-user'),
    });
    const secondAccount = new AccountDatabaseKey({
      serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
      userId: Account.fields.userId.make('second-user'),
    });

    const firstFilename = yield* makeAccountDatabaseFilename(firstAccount);
    expect(yield* makeAccountDatabaseFilename(firstAccount)).toBe(firstFilename);
    expect(yield* makeAccountDatabaseFilename(secondAccount)).not.toBe(firstFilename);
  }).pipe(Effect.provide(XxHash.layerTest))
);
