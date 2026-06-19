import { describe, expect, it, vi } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';
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
          listener: [{ table: 'users3', rows: [{ uuid: 'one', username: 'test1', name: null }] }],
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
          listener: [
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
          listener: [
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
          listener: [
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
          listener: [
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
          listener: [
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
          listener: [{ table: 'users', rows: [{ id: 1, name: 'test1' }] }],
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
          listener: [{ table: 'users', rows: [{ id: 2, name: 'test2' }] }],
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
          listener: [{ table: 'users', rows: [{ id: 3, name: 'test3' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 4, name: 'test4' }),
          execute: [{ insertId: 4n, numInsertedOrUpdatedRows: 1n }],
          listener: [{ table: 'users', rows: [{ id: 4, name: 'test4' }] }],
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
          listener: [{ table: 'users', rows: [{ id: 3, name: 'update' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 5, name: 'test5' }).returning(['id']),
          executeTakeFirst: { id: 5 },
          listener: [{ table: 'users', rows: [{ id: 5, name: 'test5' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db.insertInto('users').values({ id: 6, name: 'test6' }),
          execute: [{ insertId: 6n, numInsertedOrUpdatedRows: 1n }],
          listener: [{ table: 'users', rows: [{ id: 6, name: 'test6' }] }],
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
          listener: [{ table: 'users', rows: [{ id: 1, name: 'test1' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .insertInto('users2')
              .values({ id: 2, username: 'test2' })
              .returning(['id', 'username as userz']),
          executeTakeFirst: { id: 2, userz: 'test2' },
          listener: [{ table: 'users2', rows: [{ id: 2, username: 'test2' }] }],
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
          listener: [{ table: 'users', rows: [{ id: 1, name: 'update' }] }],
        },
        {
          query: (db: EffectKysely<KyselyDB> | EffectTransaction<KyselyDB>) =>
            db
              .updateTable('users2')
              .set({ username: 'update2' })
              .where('username', '=', 'test2')
              .returning(['id', 'username as userz']),
          executeTakeFirst: { id: 2, userz: 'update2' },
          listener: [{ table: 'users2', rows: [{ id: 2, username: 'update2' }] }],
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
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        const { db, sourceTap } = yield* TestDatabase;
        if (sourceTap !== void 0) {
          sourceTap.events.on('update', (payload) => {
            listener1(payload);
          });
          sourceTap.events.on('update', (payload) => {
            listener2(payload);
          });
          sourceTap.events.on('update', (payload) => {
            listener3(payload);
          });
        }

        for (const [j, entry] of queries.entries()) {
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

          if (sourceTap !== void 0) {
            if ('listener' in entry) {
              const listenerCallCount =
                queries.slice(0, j).filter((q) => 'listener' in q).length + 1;
              expect(listener1).toHaveBeenNthCalledWith(listenerCallCount, ...entry.listener);
              expect(listener2).toHaveBeenNthCalledWith(listenerCallCount, ...entry.listener);
              expect(listener3).toHaveBeenNthCalledWith(listenerCallCount, ...entry.listener);
            } else {
              expect(listener1).toHaveBeenCalledTimes(
                queries.slice(0, j).filter((q) => 'listener' in q).length
              );
              expect(listener2).toHaveBeenCalledTimes(
                queries.slice(0, j).filter((q) => 'listener' in q).length
              );
              expect(listener3).toHaveBeenCalledTimes(
                queries.slice(0, j).filter((q) => 'listener' in q).length
              );
            }
          } else {
            expect(listener1).toHaveBeenCalledTimes(0);
            expect(listener2).toHaveBeenCalledTimes(0);
            expect(listener3).toHaveBeenCalledTimes(0);
          }
        }

        if (sourceTap !== void 0) {
          expect(listener1).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
          expect(listener2).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
          expect(listener3).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        } else {
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        }
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
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        const { db, sourceTap } = yield* TestDatabase;
        if (sourceTap !== void 0) {
          sourceTap.events.on('update', (payload) => {
            listener1(payload);
          });
          sourceTap.events.on('update', (payload) => {
            listener2(payload);
          });
          sourceTap.events.on('update', (payload) => {
            listener3(payload);
          });
        }

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

              expect(listener1).toHaveBeenCalledTimes(0);
              expect(listener2).toHaveBeenCalledTimes(0);
              expect(listener3).toHaveBeenCalledTimes(0);
            }

            expect(listener1).toHaveBeenCalledTimes(0);
            expect(listener2).toHaveBeenCalledTimes(0);
            expect(listener3).toHaveBeenCalledTimes(0);
          })
        );

        for (const [j, entry] of queries.entries()) {
          if (sourceTap !== void 0) {
            if ('listener' in entry) {
              const listenerCallCount =
                queries.slice(0, j).filter((q) => 'listener' in q).length + 1;
              expect(listener1).toHaveBeenNthCalledWith(listenerCallCount, ...entry.listener);
              expect(listener2).toHaveBeenNthCalledWith(listenerCallCount, ...entry.listener);
              expect(listener3).toHaveBeenNthCalledWith(listenerCallCount, ...entry.listener);
            }
          } else {
            expect(listener1).toHaveBeenCalledTimes(0);
            expect(listener2).toHaveBeenCalledTimes(0);
            expect(listener3).toHaveBeenCalledTimes(0);
          }
        }

        if (sourceTap !== void 0) {
          expect(listener1).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
          expect(listener2).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
          expect(listener3).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        } else {
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        }
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
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        const listener3 = vi.fn();

        const { db, sourceTap } = yield* TestDatabase;
        if (sourceTap !== void 0) {
          sourceTap.events.on('update', (payload) => {
            listener1(payload);
          });
          sourceTap.events.on('update', (payload) => {
            listener2(payload);
          });
          sourceTap.events.on('update', (payload) => {
            listener3(payload);
          });
        }

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

                expect(listener1).toHaveBeenCalledTimes(0);
                expect(listener2).toHaveBeenCalledTimes(0);
                expect(listener3).toHaveBeenCalledTimes(0);

                if (queries.length - 1 === j) {
                  return yield* Effect.fail('Intentionally cause a rollback');
                }
              }

              expect(listener1).toHaveBeenCalledTimes(0);
              expect(listener2).toHaveBeenCalledTimes(0);
              expect(listener3).toHaveBeenCalledTimes(0);
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

        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
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
    'Modifying returned data should not affect event listeners',
    Effect.fnUntraced(
      function* () {
        const { db, sourceTap } = yield* TestDatabase;

        let capturedPayload: unknown = void 0;
        const listener = vi.fn((payload) => {
          capturedPayload = payload;
        });

        if (sourceTap !== void 0) {
          sourceTap.events.on('update', listener);
        }

        const result = yield* db.executeTakeFirstOrError(
          db.insertInto('users').values({ name: 'modification-test' }).returning(['name'])
        );

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
