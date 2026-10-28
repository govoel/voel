import { BunFileSystem } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import {
  DateTime,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Record,
  Result,
  Schema,
  Struct,
} from 'effect';
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
import { makeAccountAuthStorage } from '#src/domains/accounts/auth-client/storage.ts';
import { Encryption, EncryptionError } from '#src/domains/accounts/encryption/index.ts';
import { AccountDatabaseError } from '#src/domains/accounts/errors.ts';
import { Account, AccountRepository } from '#src/domains/accounts/repository.ts';
import { AccountKey, Account as DbAccount } from '#src/domains/accounts/schema.ts';

const RepositoryDatabaseLayer = AccountRepository.layerNoDeps.pipe(
  Layer.provideMerge(MainDatabaseTestLayer),
  Layer.provideMerge([Reactivity.layer, Encryption.layerTest])
);
const RepositoryTestLayer = RepositoryDatabaseLayer.pipe(Layer.provide(AppConfig.layerTest()));
const makeAccount = (id: string) =>
  ({
    serverUrl: AccountKey.fields.serverUrl.make('https://accounts.example.test'),
    userId: AccountKey.fields.userId.make(id),
    username: DbAccount.fields.username.make(id),
    name: DbAccount.fields.name.make(id),
    email: DbAccount.fields.email.make(`${id}@example.test`),
    role: DbAccount.fields.role.make('user'),
    profilePicture: DbAccount.fields.profilePicture.make(null),
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
        expect(account.key).toBeInstanceOf(AccountKey);
        expect(account).not.toHaveProperty('serverUrl');
        expect(account).not.toHaveProperty('userId');
        expect(Schema.is(Account)(account)).toBe(true);
        expect(Option.getOrThrow(yield* repository.findByKey(account.key))).toEqual(account);
      }
      expect(yield* repository.readAuthStorage(first)).toEqual(replacement.authStorage);
      const rows = yield* sql<{ authStorage: string }>`
        select
          *
        from
          account
      `;
      for (const row of rows) {
        expect(row.authStorage).not.toContain('credential');
        const decoded = yield* Schema.decodeUnknownEffect(DbAccount)(row);
        const key = AccountKey.make(Struct.pick(decoded, ['serverUrl', 'userId']));
        const summary = Option.getOrThrow(yield* repository.findByKey(key));
        expect(summary).toEqual({
          key,
          ...Struct.omit(decoded, ['serverUrl', 'userId', 'authStorage']),
        });
        expect(row).toMatchObject({
          active: summary.active === true ? 1 : 0,
          createdAt: DateTime.toEpochMillis(summary.createdAt),
          updatedAt: DateTime.toEpochMillis(summary.updatedAt),
        });
        expect(decoded.authStorage).toEqual(
          decoded.userId === first.userId
            ? replacement.authStorage
            : makeAccount('second').authStorage
        );
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
      const profile = Struct.omit(makeAccount('first'), ['authStorage']);
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
    'rolls back selection and credentials when column encoding fails',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const first = yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      const encryption = yield* Encryption;
      const error = EncryptionError.make({ cause: new Error('Encryption unavailable') });
      const failing = yield* AccountRepository.make.pipe(
        Effect.provideService(Encryption, { ...encryption, encrypt: () => error })
      );
      const reactivity = yield* Reactivity.Reactivity;
      let invalidations = 0;
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          reactivity.registerUnsafe(['account'], () => {
            invalidations += 1;
          })
        ),
        (remove) => Effect.sync(remove)
      );
      expect(yield* failing.upsertActive(makeAccount('second')).pipe(Effect.flip)).toMatchObject({
        _tag: 'AccountCredentialsError',
      });
      expect(
        yield* failing
          .writeAuthStorageItem({ key: first, name: 'voel_cookie', value: 'replacement' })
          .pipe(Effect.flip)
      ).toMatchObject({
        _tag: 'AccountCredentialsError',
      });
      expect(yield* repository.list).toEqual(before);
      expect(yield* repository.getActiveKey).toEqual(Option.some(first));
      expect(yield* repository.readAuthStorage(first)).toEqual(makeAccount('first').authStorage);
      expect(invalidations).toBe(0);
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
    'reports corrupt credentials as recoverable errors without affecting account projections',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const key = yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      yield* sql`
        update account
        set
          "authStorage" = 'invalid ciphertext'
        where
          "userId" = ${key.userId}
      `;
      expect(yield* repository.readAuthStorage(key).pipe(Effect.flip)).toMatchObject({
        _tag: 'AccountCredentialsError',
      });
      expect(yield* repository.list).toEqual(before);
      expect(Option.getOrThrow(yield* repository.findByKey(key))).toEqual(before[0]);
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
      const exit = yield* repository.findByKey(key).pipe(Effect.exit);
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
        acquirer: failure,
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
