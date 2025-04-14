import Database from 'bun:sqlite';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { type ColumnType, type Generated, Kysely } from 'kysely';

import { BunSqliteDialect, SourceTapDialect } from './dialect';
import { SourceTap } from './source-tap';

type KyselyDB = {
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
};

const createDb = async (sourceTap?: SourceTap<KyselyDB>) => {
  const db = new Kysely<KyselyDB>({
    dialect: sourceTap
      ? new SourceTapDialect({
          database: new Database(':memory:'),
        })
      : new BunSqliteDialect({
          database: new Database(':memory:'),
        }),
    plugins: sourceTap ? [sourceTap] : [],
    log(event) {
      if (event.level === 'query') {
        console.log(
          `${sourceTap ? '☀️' : '🍦'} dbQuery(${event.queryDurationMillis.toFixed(2)}ms) => ${event.query.sql}`
        );
      } else if (event.level === 'error') {
        console.log(
          `${sourceTap ? '☀️' : '🍦'} dbError(${event.queryDurationMillis.toFixed(2)}ms) => ${event.query.sql}`
        );
      }
      if (sourceTap) {
        sourceTap?.transactionDetector(event);
      }
    },
  });

  await db.schema
    .createTable('users')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createTable('users2')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('username', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createTable('users3')
    .addColumn('uuid', 'text', (col) => col.primaryKey().notNull())
    .addColumn('username', 'text', (col) => col.unique().notNull())
    .addColumn('name', 'text')
    .execute();

  return db;
};

describe('SourceTap', () => {
  let db: Awaited<ReturnType<typeof createDb>>;

  const cases = [
    [
      'INSERT/UPDATE without RETURNING "hack" works (single table)',
      { trackTables: new Set(['users3'] as const) },
      [
        {
          query: (db: Kysely<KyselyDB>) =>
            db.insertInto('users3').values({ uuid: 'one', username: 'test1' }),
          execute: [{ insertId: 1n, numInsertedOrUpdatedRows: 1n }],
          listener: [{ table: 'users3', rows: [{ uuid: 'one', username: 'test1', name: null }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.selectFrom('users3').selectAll(),
          execute: [{ uuid: 'one', username: 'test1', name: null }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.updateTable('users3').set({ uuid: 'updatedOne', username: 'updated1' }),
          execute: [{ numUpdatedRows: 1n }],
          listener: [
            { table: 'users3', rows: [{ uuid: 'updatedOne', username: 'updated1', name: null }] },
          ],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.selectFrom('users3').selectAll(),
          execute: [{ uuid: 'updatedOne', username: 'updated1', name: null }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
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
          query: (db: Kysely<KyselyDB>) => db.selectFrom('users3').selectAll(),
          execute: [
            { uuid: 'updatedOne', username: 'updated1', name: null },
            { uuid: 'two', username: 'test2', name: 'testName2' },
            { uuid: 'three', username: 'test3', name: 'testName3' },
          ],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.selectFrom('users3').select(['rowid', 'username']),
          execute: [
            { rowid: 2, username: 'test2' },
            { rowid: 3, username: 'test3' },
            { rowid: 1, username: 'updated1' },
          ],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
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
          query: (db: Kysely<KyselyDB>) =>
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
          query: (db: Kysely<KyselyDB>) =>
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
          query: (db: Kysely<KyselyDB>) => db.selectFrom('users3').selectAll(),
          execute: [
            { uuid: 'updatedOne', username: 'updated1', name: null },
            { uuid: 'two', username: 'test2', name: 'updatedName2' },
            { uuid: 'three', username: 'test3', name: 'updatedName2' },
            { uuid: 'four', username: 'test4', name: 'updatedName4' },
            { uuid: 'five', username: 'test5', name: 'testName5' },
          ],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.selectFrom('users3').select(['rowid', 'username']),
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
          query: (db: Kysely<KyselyDB>) =>
            db
              .insertInto('users')
              .values({ id: 1, name: 'test1' })
              .returning(['id', 'name as namez']),
          executeTakeFirst: { id: 1, namez: 'test1' },
          listener: [{ table: 'users', rows: [{ id: 1, name: 'test1' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users').select(['id as id', 'name as namez']),
          executeTakeFirstOrThrow: { id: 1, namez: 'test1' },
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.insertInto('users').values({ id: 2, name: 'test2' }).returningAll(),
          execute: [{ id: 2, name: 'test2' }],
          listener: [{ table: 'users', rows: [{ id: 2, name: 'test2' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.insertInto('users2').values({ id: 1, username: 'test1' }).returning(['username']),
          execute: [{ username: 'test1' }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db
              .insertInto('users')
              .values({ id: 3, name: 'test3' })
              .returningAll()
              .returning(['id as idz', 'name as namez']),
          executeTakeFirst: { id: 3, idz: 3, name: 'test3', namez: 'test3' },
          listener: [{ table: 'users', rows: [{ id: 3, name: 'test3' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.insertInto('users').values({ id: 4, name: 'test4' }),
          execute: [{ insertId: 4n, numInsertedOrUpdatedRows: 1n }],
          listener: [{ table: 'users', rows: [{ id: 4, name: 'test4' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.insertInto('users2').values({ username: 'test1' }),
          execute: [{ insertId: 2n, numInsertedOrUpdatedRows: 1n }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.updateTable('users2').set({ username: 'update1' }).where('username', '=', 'test1'),
          executeTakeFirst: { numUpdatedRows: 2n },
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users2').selectAll().where('username', '=', 'update1'),
          executeTakeFirst: { id: 1, username: 'update1' },
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.updateTable('users').set({ name: 'update' }).where('name', '=', 'test3'),
          executeTakeFirst: { numUpdatedRows: 1n },
          listener: [{ table: 'users', rows: [{ id: 3, name: 'update' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.insertInto('users').values({ id: 5, name: 'test5' }).returning(['id']),
          executeTakeFirst: { id: 5 },
          listener: [{ table: 'users', rows: [{ id: 5, name: 'test5' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) => db.insertInto('users').values({ id: 6, name: 'test6' }),
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
          query: (db: Kysely<KyselyDB>) =>
            db
              .insertInto('users')
              .values({ id: 1, name: 'test1' })
              .returning(['id', 'name as namez']),
          executeTakeFirst: { id: 1, namez: 'test1' },
          listener: [{ table: 'users', rows: [{ id: 1, name: 'test1' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db
              .insertInto('users2')
              .values({ id: 2, username: 'test2' })
              .returning(['id', 'username as userz']),
          executeTakeFirst: { id: 2, userz: 'test2' },
          listener: [{ table: 'users2', rows: [{ id: 2, username: 'test2' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db
              .insertInto('users3')
              .values({ uuid: 'three', username: 'test3' })
              .returning(['uuid', 'username as userz']),
          executeTakeFirst: { uuid: 'three', userz: 'test3' },
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users').select(['id as idz', 'name as namez']),
          execute: [{ idz: 1, namez: 'test1' }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users2').select(['id as idz', 'username as userz']),
          execute: [{ idz: 2, userz: 'test2' }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users3').select(['uuid as uuidz', 'username as userz']),
          execute: [{ uuidz: 'three', userz: 'test3' }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db
              .updateTable('users')
              .set({ name: 'update' })
              .where('name', '=', 'test1')
              .returning(['id', 'name as namez']),
          executeTakeFirst: { id: 1, namez: 'update' },
          listener: [{ table: 'users', rows: [{ id: 1, name: 'update' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db
              .updateTable('users2')
              .set({ username: 'update2' })
              .where('username', '=', 'test2')
              .returning(['id', 'username as userz']),
          executeTakeFirst: { id: 2, userz: 'update2' },
          listener: [{ table: 'users2', rows: [{ id: 2, username: 'update2' }] }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db
              .updateTable('users3')
              .set({ username: 'update3' })
              .where('username', '=', 'test3')
              .returning(['uuid', 'username as userz']),
          executeTakeFirst: { uuid: 'three', userz: 'update3' },
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users').select(['id as idz', 'name as namez']),
          execute: [{ idz: 1, namez: 'update' }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users2').select(['id as idz', 'username as userz']),
          execute: [{ idz: 2, userz: 'update2' }],
        },
        {
          query: (db: Kysely<KyselyDB>) =>
            db.selectFrom('users3').select(['uuid as uuidz', 'username as userz']),
          execute: [{ uuidz: 'three', userz: 'update3' }],
        },
      ],
    ],
  ] as const;

  test.each(cases)('%s', async (_, { trackTables }, queries) => {
    for (let i = 0; i < 2; i++) {
      const listener1 = mock();
      const listener2 = mock();
      const listener3 = mock();
      if (i === 0) {
        const sourceTap = new SourceTap<KyselyDB>({ trackTables });
        db = await createDb(sourceTap);
        sourceTap.events.on('update', listener1);
        sourceTap.events.on('update', listener2);
        sourceTap.events.on('update', listener3);
      } else {
        db = await createDb();
      }

      for (const [j, entry] of queries.entries()) {
        if ('executeTakeFirstOrThrow' in entry) {
          expect(await entry.query(db).executeTakeFirstOrThrow()).toEqual(
            entry.executeTakeFirstOrThrow
          );
        } else if ('executeTakeFirst' in entry) {
          expect(await entry.query(db).executeTakeFirst()).toEqual(entry.executeTakeFirst);
        } else if ('execute' in entry) {
          // @ts-expect-error Kysely doesn't recognize some queries that are valid
          expect(await entry.query(db).execute()).toEqual(entry.execute);
        } else {
          throw new Error('Invalid query entry');
        }

        if (i === 0) {
          if ('listener' in entry) {
            const listenerCallCount = queries.slice(0, j).filter((q) => 'listener' in q).length + 1;
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

      if (i === 0) {
        expect(listener1).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        expect(listener2).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        expect(listener3).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
      } else {
        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
      }

      db.destroy();
    }
  });

  test.each(cases)('Transaction (callback): %s', async (_, { trackTables }, queries) => {
    for (let i = 0; i < 2; i++) {
      const listener1 = mock();
      const listener2 = mock();
      const listener3 = mock();
      if (i === 0) {
        const sourceTap = new SourceTap<KyselyDB>({ trackTables });
        db = await createDb(sourceTap);
        sourceTap.events.on('update', listener1);
        sourceTap.events.on('update', listener2);
        sourceTap.events.on('update', listener3);
      } else {
        db = await createDb();
      }

      await db.transaction().execute(async (trx) => {
        for (const entry of queries) {
          if ('executeTakeFirstOrThrow' in entry) {
            expect(await entry.query(trx).executeTakeFirstOrThrow()).toEqual(
              entry.executeTakeFirstOrThrow
            );
          } else if ('executeTakeFirst' in entry) {
            expect(await entry.query(trx).executeTakeFirst()).toEqual(entry.executeTakeFirst);
          } else if ('execute' in entry) {
            // @ts-expect-error Kysely doesn't recognize some queries that are valid
            expect(await entry.query(trx).execute()).toEqual(entry.execute);
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
      });

      for (const [j, entry] of queries.entries()) {
        if (i === 0) {
          if ('listener' in entry) {
            const listenerCallCount = queries.slice(0, j).filter((q) => 'listener' in q).length + 1;
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

      if (i === 0) {
        expect(listener1).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        expect(listener2).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        expect(listener3).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
      } else {
        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
      }

      db.destroy();
    }
  });

  test.each(cases)('Transaction (variable): %s', async (_, { trackTables }, queries) => {
    for (let i = 0; i < 2; i++) {
      const listener1 = mock();
      const listener2 = mock();
      const listener3 = mock();
      if (i === 0) {
        const sourceTap = new SourceTap<KyselyDB>({ trackTables });
        db = await createDb(sourceTap);
        sourceTap.events.on('update', listener1);
        sourceTap.events.on('update', listener2);
        sourceTap.events.on('update', listener3);
      } else {
        db = await createDb();
      }

      const trx = await db.startTransaction().execute();
      const commitSpy = spyOn(trx, 'commit');
      const rollbackSpy = spyOn(trx, 'rollback');
      try {
        for (const entry of queries) {
          if ('executeTakeFirstOrThrow' in entry) {
            expect(await entry.query(trx).executeTakeFirstOrThrow()).toEqual(
              entry.executeTakeFirstOrThrow
            );
          } else if ('executeTakeFirst' in entry) {
            expect(await entry.query(trx).executeTakeFirst()).toEqual(entry.executeTakeFirst);
          } else if ('execute' in entry) {
            // @ts-expect-error Kysely doesn't recognize some queries that are valid
            expect(await entry.query(trx).execute()).toEqual(entry.execute);
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
        await trx.commit().execute();
      } catch {
        await trx.rollback().execute();
      }

      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(rollbackSpy).toHaveBeenCalledTimes(0);

      for (const [j, entry] of queries.entries()) {
        if (i === 0) {
          if ('listener' in entry) {
            const listenerCallCount = queries.slice(0, j).filter((q) => 'listener' in q).length + 1;
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

      if (i === 0) {
        expect(listener1).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        expect(listener2).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
        expect(listener3).toHaveBeenCalledTimes(queries.filter((q) => 'listener' in q).length);
      } else {
        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
      }

      db.destroy();
    }
  });

  test.each(cases)(
    'Transaction (callback) rollback discards events: %s',
    async (_, { trackTables }, queries) => {
      for (let i = 0; i < 2; i++) {
        const listener1 = mock();
        const listener2 = mock();
        const listener3 = mock();
        if (i === 0) {
          const sourceTap = new SourceTap<KyselyDB>({ trackTables });
          db = await createDb(sourceTap);
          sourceTap.events.on('update', listener1);
          sourceTap.events.on('update', listener2);
          sourceTap.events.on('update', listener3);
        } else {
          db = await createDb();
        }
        try {
          await db.transaction().execute(async (trx) => {
            for (const [j, entry] of queries.entries()) {
              if ('executeTakeFirstOrThrow' in entry) {
                expect(await entry.query(trx).executeTakeFirstOrThrow()).toEqual(
                  entry.executeTakeFirstOrThrow
                );
              } else if ('executeTakeFirst' in entry) {
                expect(await entry.query(trx).executeTakeFirst()).toEqual(entry.executeTakeFirst);
              } else if ('execute' in entry) {
                // @ts-expect-error Kysely doesn't recognize some queries that are valid
                expect(await entry.query(trx).execute()).toEqual(entry.execute);
              } else {
                throw new Error('Invalid query entry');
              }

              expect(listener1).toHaveBeenCalledTimes(0);
              expect(listener2).toHaveBeenCalledTimes(0);
              expect(listener3).toHaveBeenCalledTimes(0);

              if (queries.length - 1 === j) {
                throw new Error('Intentionally cause a rollback');
              }
            }

            expect(listener1).toHaveBeenCalledTimes(0);
            expect(listener2).toHaveBeenCalledTimes(0);
            expect(listener3).toHaveBeenCalledTimes(0);
          });
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toBe('Intentionally cause a rollback');
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        }

        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
        db.destroy();
      }
    }
  );

  test.each(cases)(
    'Transaction (variable) rollback discards events: %s',
    async (_, { trackTables }, queries) => {
      for (let i = 0; i < 2; i++) {
        const listener1 = mock();
        const listener2 = mock();
        const listener3 = mock();
        if (i === 0) {
          const sourceTap = new SourceTap<KyselyDB>({ trackTables });
          db = await createDb(sourceTap);
          sourceTap.events.on('update', listener1);
          sourceTap.events.on('update', listener2);
          sourceTap.events.on('update', listener3);
        } else {
          db = await createDb();
        }
        const trx = await db.startTransaction().execute();
        const commitSpy = spyOn(trx, 'commit');
        const rollbackSpy = spyOn(trx, 'rollback');
        try {
          for (const [j, entry] of queries.entries()) {
            if ('executeTakeFirstOrThrow' in entry) {
              expect(await entry.query(trx).executeTakeFirstOrThrow()).toEqual(
                entry.executeTakeFirstOrThrow
              );
            } else if ('executeTakeFirst' in entry) {
              expect(await entry.query(trx).executeTakeFirst()).toEqual(entry.executeTakeFirst);
            } else if ('execute' in entry) {
              // @ts-expect-error Kysely doesn't recognize some queries that are valid
              expect(await entry.query(trx).execute()).toEqual(entry.execute);
            } else {
              throw new Error('Invalid query entry');
            }

            expect(listener1).toHaveBeenCalledTimes(0);
            expect(listener2).toHaveBeenCalledTimes(0);
            expect(listener3).toHaveBeenCalledTimes(0);

            if (queries.length - 1 === j) {
              throw new Error('Intentionally cause a rollback');
            }
          }

          await trx.commit().execute();
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toBe('Intentionally cause a rollback');
          await trx.rollback().execute();
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        }

        expect(commitSpy).toHaveBeenCalledTimes(0);
        expect(rollbackSpy).toHaveBeenCalledTimes(1);

        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
        db.destroy();
      }
    }
  );

  test.each(cases)(
    'Transaction (variable) savepoint throws an error: %s',
    async (_, { trackTables }, queries) => {
      for (let i = 0; i < 2; i++) {
        const listener1 = mock();
        const listener2 = mock();
        const listener3 = mock();
        if (i === 0) {
          const sourceTap = new SourceTap<KyselyDB>({ trackTables });
          db = await createDb(sourceTap);
          sourceTap.events.on('update', listener1);
          sourceTap.events.on('update', listener2);
          sourceTap.events.on('update', listener3);
        } else {
          db = await createDb();
        }
        const trx = await db.startTransaction().execute();
        const savepointSpy = spyOn(trx, 'savepoint');
        const commitSpy = spyOn(trx, 'commit');
        const rollbackSpy = spyOn(trx, 'rollback');
        try {
          for (const [j, entry] of queries.entries()) {
            if ('executeTakeFirstOrThrow' in entry) {
              expect(await entry.query(trx).executeTakeFirstOrThrow()).toEqual(
                entry.executeTakeFirstOrThrow
              );
            } else if ('executeTakeFirst' in entry) {
              expect(await entry.query(trx).executeTakeFirst()).toEqual(entry.executeTakeFirst);
            } else if ('execute' in entry) {
              // @ts-expect-error Kysely doesn't recognize some queries that are valid
              expect(await entry.query(trx).execute()).toEqual(entry.execute);
            } else {
              throw new Error('Invalid query entry');
            }

            expect(listener1).toHaveBeenCalledTimes(0);
            expect(listener2).toHaveBeenCalledTimes(0);
            expect(listener3).toHaveBeenCalledTimes(0);

            if (queries.length - 1 === j) {
              await trx.savepoint('test').execute();
            }
          }

          await trx.commit().execute();
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toBe('SourceTap does not support nested transactions');
          await trx.rollback().execute();
          expect(listener1).toHaveBeenCalledTimes(0);
          expect(listener2).toHaveBeenCalledTimes(0);
          expect(listener3).toHaveBeenCalledTimes(0);
        }

        // default driver supports nested transactions, but SourceTap does not
        expect(savepointSpy).toHaveBeenCalledTimes(1);
        expect(commitSpy).toHaveBeenCalledTimes(i === 1 ? 1 : 0);
        expect(rollbackSpy).toHaveBeenCalledTimes(i === 1 ? 0 : 1);

        expect(listener1).toHaveBeenCalledTimes(0);
        expect(listener2).toHaveBeenCalledTimes(0);
        expect(listener3).toHaveBeenCalledTimes(0);
        db.destroy();
      }
    }
  );

  test('Modifying returned data should not affect event listeners', async () => {
    const sourceTap = new SourceTap<KyselyDB>({ trackTables: new Set(['users']) });
    const db = await createDb(sourceTap);

    let capturedPayload: unknown;
    const listener = mock((payload) => {
      capturedPayload = payload;
    });

    sourceTap.events.on('update', listener);

    const result = await db
      .insertInto('users')
      .values({ name: 'modification-test' })
      .returning(['name'])
      .executeTakeFirstOrThrow();

    result.name = 'MODIFIED';

    expect(capturedPayload).toEqual({
      table: 'users',
      rows: [{ id: 1, name: 'modification-test' }],
    });
    expect(result).toEqual({ name: 'MODIFIED' });
    expect(result).not.toBe(capturedPayload);

    await db.destroy();
  });

  afterEach(async () => {
    await db.destroy();
  });
});
