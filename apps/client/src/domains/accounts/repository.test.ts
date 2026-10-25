import { BunFileSystem } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { DateTime, Effect, Exit, FileSystem, Layer, Option, Record, Result, Schema } from 'effect';
import { Reactivity } from 'effect/reactivity';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- Keep the SQL barrel out of Metro.
import * as SqlClient from 'effect/sql/SqlClient';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- Keep the SQL barrel out of Metro.
import * as SqlError from 'effect/sql/SqlError';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- Keep the SQL barrel out of Metro.
import * as Statement from 'effect/sql/Statement';

import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { AppConfig } from '#src/config.ts';
import { MainDatabase } from '#src/database/main/index.ts';
import { MainDatabaseTestLayer } from '#src/database/main/testing.ts';
import { AuthEncryption } from '#src/domains/accounts/auth-client/encryption.ts';
import { makeAccountAuthStorage } from '#src/domains/accounts/auth-client/storage.ts';
import { AccountDatabaseError } from '#src/domains/accounts/errors.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account, AccountKey } from '#src/domains/accounts/schema.ts';

const RepositoryDatabaseLayer = AccountRepository.layerNoDeps.pipe(
  Layer.provideMerge(MainDatabaseTestLayer),
  Layer.provideMerge([Reactivity.layer, AuthEncryption.layerTest])
);
const RepositoryTestLayer = RepositoryDatabaseLayer.pipe(Layer.provide(AppConfig.layerTest()));
const makeAccount = (id: string) =>
  ({
    account: {
      serverUrl: AccountKey.fields.serverUrl.make('https://accounts.example.test'),
      userId: AccountKey.fields.userId.make(id),
      username: Account.fields.username.make(id),
      name: Account.fields.name.make(id),
      email: Account.fields.email.make(`${id}@example.test`),
      role: Account.fields.role.make('user'),
      profilePicture: Account.fields.profilePicture.make(null),
    },
    authStorage: { voel_cookie: `credential-for-${id}` },
  }) satisfies Parameters<typeof AccountRepository.Service.upsertActive>[0];

describe('AccountRepository', () => {
  it.effect(
    'recovers from real database contention without publishing selection or credential changes',
    Effect.fnUntraced(
      function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const path = `${directory}/accounts.db`;
        yield* Effect.gen(function* () {
          const repository = yield* AccountRepository;
          const sql = yield* MainDatabase;
          const contender = yield* TursoSyncClient.make({ path });
          const first = yield* repository.upsertActive(makeAccount('first'));
          const second = yield* repository.upsertActive(makeAccount('second'));
          yield* repository.setActive(first);
          const before = yield* repository.list;
          const credentials = yield* repository.readAuthStorage(first);
          yield* sql`
            pragma busy_timeout = 0
          `;
          yield* contender.withTransaction(
            Effect.gen(function* () {
              const errors = yield* Effect.all([
                repository.setActive(second).pipe(Effect.flip),
                repository
                  .writeAuthStorageItem({ key: first, name: 'voel_cookie', value: 'replacement' })
                  .pipe(Effect.flip),
              ]);
              for (const error of errors) {
                expect(error).toBeInstanceOf(AccountDatabaseError);
                expect(error).toMatchObject({ cause: { reason: { _tag: 'LockTimeoutError' } } });
              }
              expect(yield* repository.list).toEqual(before);
              expect(yield* repository.readAuthStorage(first)).toEqual(credentials);
            })
          );
          yield* repository.setActive(second);
          expect(yield* repository.getActiveKey).toEqual(Option.some(second));
        }).pipe(
          Effect.provide(
            RepositoryDatabaseLayer.pipe(
              Layer.provide(AppConfig.layerTest({ MAIN_DB_FILENAME: path }))
            )
          )
        );
      },
      Effect.provide([BunFileSystem.layer, Reactivity.layer])
    )
  );

  it.effect(
    'returns branded database keys, deduplicates sign-ins, and keeps credentials out of account projections',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const first = yield* repository.upsertActive(makeAccount('first'));
      const second = yield* repository.upsertActive(makeAccount('second'));
      const replacement = {
        ...makeAccount('first'),
        authStorage: { voel_cookie: 'replacement-credential' },
      };
      expect(yield* repository.upsertActive(replacement)).toEqual(first);
      expect(first).toBeInstanceOf(AccountKey);
      expect(Record.keys(first).sort()).toEqual(['serverUrl', 'userId']);
      const accounts = yield* repository.list;
      expect(accounts).toHaveLength(2);
      expect(accounts).toMatchObject([
        { key: first, active: true },
        { key: second, active: false },
      ]);
      expect(accounts[0]).not.toHaveProperty('authStorage');
      for (const account of accounts) {
        expect(account).toBeInstanceOf(Account);
        expect(account.key).toBeInstanceOf(AccountKey);
        expect(account).not.toHaveProperty('serverUrl');
        expect(account).not.toHaveProperty('userId');
        const row = yield* Schema.encodeEffect(AccountRepository.fromRow)(account);
        expect(row).toMatchObject({
          serverUrl: account.key.serverUrl,
          userId: account.key.userId,
          active: account.active === true ? 1 : 0,
          createdAt: DateTime.toEpochMillis(account.createdAt),
          updatedAt: DateTime.toEpochMillis(account.updatedAt),
        });
        expect(yield* Schema.encodeEffect(Account)(account)).toMatchObject({
          active: account.active,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        });
        expect(row).not.toHaveProperty('key');
        expect(yield* Schema.decodeEffect(AccountRepository.fromRow)(row)).toEqual(account);
        expect(yield* repository.getByKey(account.key)).toEqual(account);
      }
      expect(yield* repository.readAuthStorage(first)).toEqual(replacement.authStorage);
      const rows = yield* sql<{ authStorage: string }>`
        select
          "authStorage"
        from
          account
      `;
      for (const row of rows) {
        expect(row.authStorage).not.toContain('credential');
      }
      yield* repository.setActive(second);
      yield* repository.setActive(second);
      expect(yield* repository.getActiveKey).toEqual(Option.some(second));
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'publishes account changes once, only after the outer transaction commits',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const first = yield* repository.upsertActive(makeAccount('first'));
      const second = yield* repository.upsertActive(makeAccount('second'));
      const reactivity = yield* Reactivity.Reactivity;
      const invalidations = { count: 0 };
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          reactivity.registerUnsafe(['account'], () => {
            invalidations.count += 1;
          })
        ),
        (remove) => Effect.sync(remove)
      );
      const profile = makeAccount('first').account;
      const writes = [
        repository.setActive(first),
        repository.updateProfile({ key: first, profile }),
        repository.remove(second),
      ];
      for (const [index, write] of writes.entries()) {
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* write;
            expect(invalidations.count).toBe(index);
          })
        );
        expect(invalidations.count).toBe(index + 1);
      }
      const before = yield* repository.list;
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* repository.upsertActive(makeAccount('third'));
            return yield* Effect.fail('rollback');
          })
        )
        .pipe(Effect.flip);
      expect(invalidations.count).toBe(3);
      expect(yield* repository.list).toEqual(before);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'rolls back account selection and credential replacement together when SQL fails',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const first = yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      const credentials = yield* repository.readAuthStorage(first);
      yield* sql`
        create trigger reject_account before insert on account begin
        select
          raise (abort, 'forced write failure');

        end
      `;
      const exit = yield* repository
        .upsertActive({ ...makeAccount('first'), authStorage: { voel_cookie: 'replacement' } })
        .pipe(Effect.exit);
      expect(Exit.hasFails(exit)).toBe(false);
      expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SqlError' });
      expect(yield* repository.list).toEqual(before);
      expect(yield* repository.readAuthStorage(first)).toEqual(credentials);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'serializes encrypted storage updates and removes credentials with the account',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const key = yield* repository.upsertActive(makeAccount('first'));
      const storage = yield* makeAccountAuthStorage(key);
      yield* Effect.promise(async () =>
        Promise.all([
          storage.setItemAsync('voel_cookie', 'rotated-cookie'),
          storage.setItemAsync('voel_session_data', 'cached-session'),
          storage.setItemAsync('voel_cookie.0.0', 'a chunk'),
        ])
      );
      expect(yield* repository.readAuthStorage(key)).toEqual({
        voel_cookie: 'rotated-cookie',
        voel_session_data: 'cached-session',
        'voel_cookie.0.0': 'a chunk',
      });
      yield* repository.remove(key);
      expect(yield* repository.getActiveKey).toEqual(Option.none());
      expect(yield* repository.findByKey(key)).toEqual(Option.none());
      expect(yield* Effect.promise(async () => storage.getItemAsync('voel_cookie'))).toBeNull();
      yield* Effect.promise(async () => storage.setItemAsync('voel_cookie', 'late callback'));
      expect(yield* repository.list).toEqual([]);
      expect(yield* repository.setActive(key).pipe(Effect.flip)).toMatchObject({
        _tag: 'AccountNotFoundError',
      });
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'authenticates encrypted data against the account identity',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const first = yield* repository.upsertActive(makeAccount('first'));
      const second = yield* repository.upsertActive(makeAccount('second'));
      yield* sql`
        update account
        set
          "authStorage" = (
            select
              "authStorage"
            from
              account
            where
              "userId" = ${first.userId}
          )
        where
          "userId" = ${second.userId}
      `;
      expect(yield* repository.readAuthStorage(second).pipe(Effect.flip)).toMatchObject({
        _tag: 'AccountCredentialsError',
      });
      expect(yield* repository.readAuthStorage(first)).toEqual(makeAccount('first').authStorage);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'preserves schema defects when reading corrupt persisted rows',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const key = yield* repository.upsertActive(makeAccount('first'));
      yield* sql`
        update account
        set
          "createdAt" = 8640000000000001
      `;
      const exit = yield* repository.getByKey(key).pipe(Effect.exit);
      expect(Exit.hasFails(exit)).toBe(false);
      expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SchemaError' });
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'reports connection acquisition failures as recoverable database errors',
    Effect.fnUntraced(function* () {
      const database = yield* MainDatabase;
      const failure = SqlError.SqlError.make({
        reason: SqlError.ConnectionError.make({ cause: new Error('Connection unavailable') }),
      });
      const client = yield* SqlClient.make({
        driver: 'test',
        acquirer: Effect.fail(failure),
        compiler: Statement.makeCompilerSqlite(),
        spanAttributes: [],
      });
      const repository = yield* AccountRepository.make.pipe(
        Effect.provideService(MainDatabase, Object.assign(client, { pull: database.pull }))
      );
      const error = yield* repository.list.pipe(Effect.flip);
      expect(error).toBeInstanceOf(AccountDatabaseError);
      expect(error.cause).toBe(failure);
    }, Effect.provide(RepositoryTestLayer))
  );
});
