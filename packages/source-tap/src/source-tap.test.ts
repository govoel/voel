import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Queue, Stream } from 'effect';
import { sql } from 'kysely';
import type { ColumnType, Generated } from 'kysely';

import { createDatabase } from '#src/effect-kysely.ts';
import type { EffectKysely, EffectTransaction } from '#src/effect-kysely.ts';
import type { SourceTap } from '#src/source-tap.ts';

interface KyselyDB {
  users: {
    rowid: ColumnType<number, never, never>;
    id: Generated<number>;
    name: string;
  };
  users2: {
    rowid: ColumnType<number, never, never>;
    id: Generated<number>;
    username: string;
  };
  users3: {
    rowid: ColumnType<number, never, never>;
    uuid: string;
    username: string;
    name: string | null;
  };
}

class TestDatabase extends Context.Service<
  TestDatabase,
  { db: EffectKysely<KyselyDB>; sourceTap: SourceTap<KyselyDB> | undefined }
>()('@repo/source-tap/source-tap.test/TestDatabase', {
  make: Effect.fnUntraced(function* ({
    trackTables,
  }: {
    trackTables?: Parameters<typeof createDatabase<KyselyDB>>['0']['trackTables'];
  }) {
    const { db, sourceTap } = yield* createDatabase<KyselyDB>({
      filename: ':memory:',
      enableLogging: true,
      ...(trackTables !== void 0 ? { trackTables } : {}),
    });

    yield* db.execute(sql`
      create table users (
        id integer primary key autoincrement not null,
        name text not null
      );
    `);

    yield* db.execute(sql`
      create table users2 (
        id integer primary key autoincrement not null,
        username text not null
      );
    `);

    yield* db.execute(sql`
      create table users3 (
        uuid text primary key not null,
        username text unique not null,
        name text
      );
    `);

    return { db, sourceTap };
  }),
}) {
  public static readonly layer = (args: Parameters<(typeof this)['make']>['0']) =>
    Layer.effect(this, this.make(args));
}

const makeUpdateQueue = Effect.fnUntraced(function* (sourceTap: SourceTap<KyselyDB> | undefined) {
  const queue = yield* Queue.unbounded<unknown>();

  if (sourceTap === void 0) {
    return queue;
  }

  yield* sourceTap.updates.pipe(
    Stream.map((payload) => ({ table: payload.table, rows: payload.rows })),
    Stream.runForEach((payload) => Queue.offer(queue, payload)),
    Effect.forkScoped
  );

  yield* Effect.yieldNow;

  return queue;
});

const expectNoUpdates = Effect.fnUntraced(function* (queue: Queue.Dequeue<unknown>) {
  expect(yield* Queue.size(queue)).toBe(0);
});

const expectUpdates = Effect.fnUntraced(function* (
  queue: Queue.Dequeue<unknown>,
  updates: readonly unknown[]
) {
  for (const update of updates) {
    expect(yield* Queue.take(queue)).toEqual(update);
  }
});

const expectUpdateForEntry = Effect.fnUntraced(function* (
  sourceTap: SourceTap<KyselyDB> | undefined,
  queue: Queue.Dequeue<unknown>,
  entry: { readonly updates?: readonly unknown[]; readonly [key: string]: unknown }
) {
  if (sourceTap !== void 0 && 'updates' in entry) {
    yield* expectUpdates(queue, entry.updates);
    return;
  }

  yield* expectNoUpdates(queue);
});

const expectAllUpdates = Effect.fnUntraced(function* (
  sourceTap: SourceTap<KyselyDB> | undefined,
  queue: Queue.Dequeue<unknown>,
  queries: readonly { readonly updates?: readonly unknown[]; readonly [key: string]: unknown }[]
) {
  if (sourceTap !== void 0) {
    for (const entry of queries) {
      if ('updates' in entry) {
        yield* expectUpdates(queue, entry.updates);
      }
    }
  }

  yield* expectNoUpdates(queue);
});

describe('SourceTap', () => {
  const cases = [
    [
      'INSERT/UPDATE without RETURNING "hack" works (single table)',
      { trackTables: new Set(['users3'] as const) },
      [
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users3').values({ uuid: 'one', username: 'test1' }),
          execute: [{ insertId: 1n, numInsertedOrUpdatedRows: 1n }],
          updates: [{ table: 'users3', rows: [{ uuid: 'one', username: 'test1', name: null }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').selectAll(),
          execute: [{ uuid: 'one', username: 'test1', name: null }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.updateTable('users3').set({ uuid: 'updatedOne', username: 'updated1' }),
          execute: [{ numUpdatedRows: 1n }],
          updates: [
            { table: 'users3', rows: [{ uuid: 'updatedOne', username: 'updated1', name: null }] },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').selectAll(),
          execute: [{ uuid: 'updatedOne', username: 'updated1', name: null }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users3').values([
              { uuid: 'two', username: 'test2', name: 'testName2' },
              { uuid: 'three', username: 'test3', name: 'testName3' },
            ]),
          executeTakeFirstOrThrow: { insertId: 3n, numInsertedOrUpdatedRows: 2n },
          updates: [
            {
              table: 'users3',
              rows: [
                { uuid: 'two', username: 'test2', name: 'testName2' },
                { uuid: 'three', username: 'test3', name: 'testName3' },
              ],
            },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').selectAll(),
          execute: [
            { uuid: 'updatedOne', username: 'updated1', name: null },
            { uuid: 'two', username: 'test2', name: 'testName2' },
            { uuid: 'three', username: 'test3', name: 'testName3' },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').select(['rowid', 'username']),
          execute: [
            { rowid: 2, username: 'test2' },
            { rowid: 3, username: 'test3' },
            { rowid: 1, username: 'updated1' },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .updateTable('users3')
              .set({ name: 'updatedName2' })
              .where((eb) => eb.or([eb('uuid', '=', 'two'), eb('uuid', '=', 'three')])),
          executeTakeFirstOrThrow: { numUpdatedRows: 2n },
          updates: [
            {
              table: 'users3',
              rows: [
                { uuid: 'two', username: 'test2', name: 'updatedName2' },
                { uuid: 'three', username: 'test3', name: 'updatedName2' },
              ],
            },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users3')
              .values([
                { uuid: 'four', username: 'test4', name: 'testName4' },
                { uuid: 'five', username: 'test5', name: 'testName5' },
              ])
              .returning(['uuid as uuid', 'username as username', 'name as name']),
          execute: [
            { uuid: 'four', username: 'test4', name: 'testName4' },
            { uuid: 'five', username: 'test5', name: 'testName5' },
          ],
          updates: [
            {
              table: 'users3',
              rows: [
                { uuid: 'four', username: 'test4', name: 'testName4' },
                { uuid: 'five', username: 'test5', name: 'testName5' },
              ],
            },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .updateTable('users3')
              .set({ name: 'updatedName4' })
              .where('uuid', '=', 'four')
              .returning(['uuid as uuid', 'username as username', 'name as name']),
          execute: [{ uuid: 'four', username: 'test4', name: 'updatedName4' }],
          updates: [
            {
              table: 'users3',
              rows: [{ uuid: 'four', username: 'test4', name: 'updatedName4' }],
            },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').selectAll(),
          execute: [
            { uuid: 'updatedOne', username: 'updated1', name: null },
            { uuid: 'two', username: 'test2', name: 'updatedName2' },
            { uuid: 'three', username: 'test3', name: 'updatedName2' },
            { uuid: 'four', username: 'test4', name: 'updatedName4' },
            { uuid: 'five', username: 'test5', name: 'testName5' },
          ],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').select(['rowid', 'username']),
          execute: [
            { rowid: 2, username: 'test2' },
            { rowid: 3, username: 'test3' },
            { rowid: 4, username: 'test4' },
            { rowid: 5, username: 'test5' },
            { rowid: 1, username: 'updated1' },
          ],
        },
      ],
    ],
    [
      'Should handle INSERTs/UPDATEs correctly (single table)',
      { trackTables: new Set(['users'] as const) },
      [
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users')
              .values({ id: 1, name: 'test1' })
              .returning(['id', 'name as namez']),
          executeTakeFirst: { id: 1, namez: 'test1' },
          updates: [{ table: 'users', rows: [{ id: 1, name: 'test1' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users').select(['id as id', 'name as namez']),
          executeTakeFirstOrThrow: { id: 1, namez: 'test1' },
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 2, name: 'test2' }).returningAll(),
          execute: [{ id: 2, name: 'test2' }],
          updates: [{ table: 'users', rows: [{ id: 2, name: 'test2' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users2').values({ id: 1, username: 'test1' }).returning(['username']),
          execute: [{ username: 'test1' }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users')
              .values({ id: 3, name: 'test3' })
              .returningAll()
              .returning(['id as idz', 'name as namez']),
          executeTakeFirst: { id: 3, idz: 3, name: 'test3', namez: 'test3' },
          updates: [{ table: 'users', rows: [{ id: 3, name: 'test3' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 4, name: 'test4' }),
          execute: [{ insertId: 4n, numInsertedOrUpdatedRows: 1n }],
          updates: [{ table: 'users', rows: [{ id: 4, name: 'test4' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users2').values({ username: 'test1' }),
          execute: [{ insertId: 2n, numInsertedOrUpdatedRows: 1n }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.updateTable('users2').set({ username: 'update1' }).where('username', '=', 'test1'),
          executeTakeFirst: { numUpdatedRows: 2n },
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users2').selectAll().where('username', '=', 'update1'),
          executeTakeFirst: { id: 1, username: 'update1' },
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.updateTable('users').set({ name: 'update' }).where('name', '=', 'test3'),
          executeTakeFirst: { numUpdatedRows: 1n },
          updates: [{ table: 'users', rows: [{ id: 3, name: 'update' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 5, name: 'test5' }).returning(['id']),
          executeTakeFirst: { id: 5 },
          updates: [{ table: 'users', rows: [{ id: 5, name: 'test5' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 6, name: 'test6' }),
          execute: [{ insertId: 6n, numInsertedOrUpdatedRows: 1n }],
          updates: [{ table: 'users', rows: [{ id: 6, name: 'test6' }] }],
        },
      ],
    ],
    [
      'Multiple tracked tables',
      { trackTables: new Set(['users', 'users2'] as const) },
      [
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users')
              .values({ id: 1, name: 'test1' })
              .returning(['id', 'name as namez']),
          executeTakeFirst: { id: 1, namez: 'test1' },
          updates: [{ table: 'users', rows: [{ id: 1, name: 'test1' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users2')
              .values({ id: 2, username: 'test2' })
              .returning(['id', 'username as userz']),
          executeTakeFirst: { id: 2, userz: 'test2' },
          updates: [{ table: 'users2', rows: [{ id: 2, username: 'test2' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users3')
              .values({ uuid: 'three', username: 'test3' })
              .returning(['uuid', 'username as userz']),
          executeTakeFirst: { uuid: 'three', userz: 'test3' },
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users').select(['id as idz', 'name as namez']),
          execute: [{ idz: 1, namez: 'test1' }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users2').select(['id as idz', 'username as userz']),
          execute: [{ idz: 2, userz: 'test2' }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').select(['uuid as uuidz', 'username as userz']),
          execute: [{ uuidz: 'three', userz: 'test3' }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .updateTable('users')
              .set({ name: 'update' })
              .where('name', '=', 'test1')
              .returning(['id', 'name as namez']),
          executeTakeFirst: { id: 1, namez: 'update' },
          updates: [{ table: 'users', rows: [{ id: 1, name: 'update' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .updateTable('users2')
              .set({ username: 'update2' })
              .where('username', '=', 'test2')
              .returning(['id', 'username as userz']),
          executeTakeFirst: { id: 2, userz: 'update2' },
          updates: [{ table: 'users2', rows: [{ id: 2, username: 'update2' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .updateTable('users3')
              .set({ username: 'update3' })
              .where('username', '=', 'test3')
              .returning(['uuid', 'username as userz']),
          executeTakeFirst: { uuid: 'three', userz: 'update3' },
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users').select(['id as idz', 'name as namez']),
          execute: [{ idz: 1, namez: 'update' }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users2').select(['id as idz', 'username as userz']),
          execute: [{ idz: 2, userz: 'update2' }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.selectFrom('users3').select(['uuid as uuidz', 'username as userz']),
          execute: [{ uuidz: 'three', userz: 'update3' }],
        },
      ],
    ],
  ] as const;

  it.effect.each(cases)(
    '%s',
    Effect.fnUntraced(function* ([_, { trackTables }, queries]) {
      const effect = Effect.fnUntraced(function* () {
        const { db, sourceTap } = yield* TestDatabase;
        const updates = yield* makeUpdateQueue(sourceTap);

        for (const entry of queries) {
          if ('executeTakeFirstOrThrow' in entry) {
            expect(yield* db.executeTakeFirstOrError(entry.query(db))).toEqual(
              entry.executeTakeFirstOrThrow
            );
          } else if ('executeTakeFirst' in entry) {
            expect(yield* db.executeTakeFirstOrError(entry.query(db))).toEqual(
              entry.executeTakeFirst
            );
          } else if ('execute' in entry) {
            expect(yield* db.execute(entry.query(db))).toEqual(entry.execute);
          } else {
            throw new Error('Invalid query entry');
          }

          yield* expectUpdateForEntry(sourceTap, updates, entry);
        }

        yield* expectNoUpdates(updates);
      });

      yield* Effect.all(
        [
          effect().pipe(Effect.provide(TestDatabase.layer({ trackTables }))),
          effect().pipe(Effect.provide(TestDatabase.layer({}))),
        ],
        { concurrency: 1 }
      );
    })
  );

  it.effect.each(cases)(
    'Transaction: %s',
    Effect.fnUntraced(function* ([_, { trackTables }, queries]) {
      const effect = Effect.fnUntraced(function* () {
        const { db, sourceTap } = yield* TestDatabase;
        const updates = yield* makeUpdateQueue(sourceTap);

        yield* db.trx().execute(
          Effect.fnUntraced(function* (trx) {
            for (const entry of queries) {
              if ('executeTakeFirstOrThrow' in entry) {
                expect(yield* trx.executeTakeFirstOrError(entry.query(trx))).toEqual(
                  entry.executeTakeFirstOrThrow
                );
              } else if ('executeTakeFirst' in entry) {
                expect(yield* trx.executeTakeFirstOrError(entry.query(trx))).toEqual(
                  entry.executeTakeFirst
                );
              } else if ('execute' in entry) {
                expect(yield* trx.execute(entry.query(trx))).toEqual(entry.execute);
              } else {
                throw new Error('Invalid query entry');
              }

              yield* expectNoUpdates(updates);
            }

            yield* expectNoUpdates(updates);
          })
        );

        yield* expectAllUpdates(sourceTap, updates, queries);
      });

      yield* Effect.all(
        [
          effect().pipe(Effect.provide(TestDatabase.layer({ trackTables }))),
          effect().pipe(Effect.provide(TestDatabase.layer({}))),
        ],
        { concurrency: 1 }
      );
    })
  );

  it.effect.each(cases)(
    'Transaction rollback discards events: %s',
    Effect.fnUntraced(function* ([_, { trackTables }, queries]) {
      const effect = Effect.fnUntraced(function* () {
        const { db, sourceTap } = yield* TestDatabase;
        const updates = yield* makeUpdateQueue(sourceTap);

        yield* db
          .trx()
          .execute(
            Effect.fnUntraced(function* (trx) {
              for (const [j, entry] of queries.entries()) {
                if ('executeTakeFirstOrThrow' in entry) {
                  expect(yield* trx.executeTakeFirstOrError(entry.query(trx))).toEqual(
                    entry.executeTakeFirstOrThrow
                  );
                } else if ('executeTakeFirst' in entry) {
                  expect(yield* trx.executeTakeFirstOrError(entry.query(trx))).toEqual(
                    entry.executeTakeFirst
                  );
                } else if ('execute' in entry) {
                  expect(yield* trx.execute(entry.query(trx))).toEqual(entry.execute);
                } else {
                  throw new Error('Invalid query entry');
                }

                yield* expectNoUpdates(updates);

                if (queries.length - 1 === j) {
                  return yield* Effect.fail('Intentionally cause a rollback');
                }
              }

              yield* expectNoUpdates(updates);
              expect(1).toEqual(2); // Should not reach here

              return yield* Effect.void;
            })
          )
          .pipe(
            Effect.catch((error) => {
              expect(error).toEqual('Intentionally cause a rollback');
              return Effect.void;
            })
          );

        yield* expectNoUpdates(updates);
      });

      yield* Effect.all(
        [
          effect().pipe(Effect.provide(TestDatabase.layer({ trackTables }))),
          effect().pipe(Effect.provide(TestDatabase.layer({}))),
        ],
        { concurrency: 1 }
      );
    })
  );

  it.effect(
    'Modifying returned data should not affect stream updates',
    Effect.fnUntraced(
      function* () {
        const { db, sourceTap } = yield* TestDatabase;
        const updates = yield* makeUpdateQueue(sourceTap);

        const result = yield* db.executeTakeFirstOrError(
          db.insertInto('users').values({ name: 'modification-test' }).returning(['name'])
        );
        const capturedPayload = yield* Queue.take(updates);

        result.name = 'MODIFIED';

        expect(capturedPayload).toEqual({
          table: 'users',
          rows: [{ id: 1, name: 'modification-test' }],
        });
        expect(result).toEqual({ name: 'MODIFIED' });
        expect(result).not.toBe(capturedPayload);
      },
      (effect) =>
        effect.pipe(
          Effect.provide(TestDatabase.layer({ trackTables: new Set(['users'] as const) }))
        )
    )
  );
});
