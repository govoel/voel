import { BunFileSystem } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, FileSystem, Layer, Option, Result } from 'effect';
import { Reactivity } from 'effect/reactivity';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- Keep the SQL barrel out of Metro.
import * as SqlError from 'effect/sql/SqlError';

import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { AccountDatabaseError, AccountNotFoundError } from '#src/services/accounts/errors.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import type { AccountUpsert } from '#src/services/accounts/repository.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import {
  MainDatabaseTestLayer,
  insertAccountFixture,
} from '#src/services/database/main/testing.ts';

const RepositoryTestLayer = AccountRepository.layerNoDeps.pipe(
  Layer.provideMerge(MainDatabaseTestLayer),
  Layer.provide(AppConfig.layerTest())
);

const makeAccount = (id: string) =>
  ({
    serverUrl: Account.fields.serverUrl.make('https://accounts.example.test'),
    userId: Account.fields.userId.make(id),
    authStorageId: Account.fields.authStorageId.make(`${id}-credentials`),
    username: Account.fields.username.make(id),
    name: Account.fields.name.make(id),
    email: Account.fields.email.make(`${id}@example.test`),
    role: Account.fields.role.make('user'),
    profilePicture: Account.fields.profilePicture.make(null),
  }) satisfies AccountUpsert;

describe('AccountRepository', () => {
  it.effect(
    'atomically selects an existing account and converges on repeated selection',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const first = makeAccount('first');
      const second = makeAccount('second');
      yield* repository.upsertActive(first);
      yield* insertAccountFixture({ ...second, active: false });

      yield* repository.setActive(second);
      yield* repository.setActive(second);

      expect(yield* repository.list).toMatchObject([
        { userId: first.userId, active: false },
        { userId: second.userId, active: true },
      ]);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'rolls back selection of a missing account without changing the previous active row',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      const missing = makeAccount('missing');

      expect(yield* repository.setActive(missing).pipe(Effect.flip)).toEqual(
        AccountNotFoundError.make({ serverUrl: missing.serverUrl, userId: missing.userId })
      );
      expect(yield* repository.list).toEqual(before);
      expect(yield* repository.getByKey(missing).pipe(Effect.flip)).toEqual(
        AccountNotFoundError.make({ serverUrl: missing.serverUrl, userId: missing.userId })
      );
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'upserts and activates together, replacing credentials without duplicating an account',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const first = makeAccount('first');
      const second = makeAccount('second');
      yield* repository.upsertActive(first);
      yield* repository.upsertActive(second);
      const replacement = {
        ...first,
        authStorageId: Account.fields.authStorageId.make('replacement-credentials'),
        name: Account.fields.name.make('Updated profile'),
      };

      yield* repository.upsertActive(replacement);
      yield* repository.upsertActive(replacement);

      expect(yield* repository.list).toMatchObject([
        { ...replacement, active: true },
        { ...second, active: false },
      ]);
      expect(yield* repository.getByStorageKey(first)).toEqual(Option.none());
      // Events/removals from old credentials must not affect the replacement sign-in.
      yield* repository.updateProfile({
        ...first,
        name: Account.fields.name.make('Stale profile'),
      });
      yield* repository.remove(first);
      expect(Option.getOrThrow(yield* repository.getActive)).toMatchObject(replacement);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'rolls back deactivation and credential replacement when an upsert fails in SQL',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const first = makeAccount('first');
      const second = makeAccount('second');
      yield* repository.upsertActive(first);
      yield* insertAccountFixture({ ...second, active: false });
      const before = yield* repository.list;
      yield* sql`
          create trigger reject_upsert before insert on account begin
          select
            raise (abort, 'Forced account write failure');

          end
        `;

      const exit = yield* repository
        .upsertActive({
          ...second,
          authStorageId: Account.fields.authStorageId.make('replacement-credentials'),
        })
        .pipe(Effect.asVoid, Effect.exit);

      expect(Exit.hasFails(exit)).toBe(false);
      expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SqlError' });
      expect(yield* repository.list).toEqual(before);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'defects on schema encoding failures and rolls back deactivation',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      const exit = yield* repository
        .upsertActive({
          ...makeAccount('second'),
          // Simulate a runtime caller violating the branded request contract.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentionally invalid runtime input
          role: 'invalid-role' as AccountUpsert['role'],
        })
        .pipe(Effect.asVoid, Effect.exit);

      expect(Exit.hasFails(exit)).toBe(false);
      expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SchemaError' });
      expect(yield* repository.list).toEqual(before);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'preserves schema defects for invalid persisted rows across UI queries',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const account = makeAccount('first');
      yield* repository.upsertActive(account);
      yield* sql`
          update account
          set
            "createdAt" = 8640000000000001
        `;

      const exits = yield* Effect.all([
        repository.list.pipe(Effect.asVoid, Effect.exit),
        repository.getActive.pipe(Effect.asVoid, Effect.exit),
        repository.getByKey(account).pipe(Effect.asVoid, Effect.exit),
        repository.getByStorageKey(account).pipe(Effect.asVoid, Effect.exit),
      ]);
      for (const exit of exits) {
        expect(Exit.hasFails(exit)).toBe(false);
        expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SchemaError' });
      }
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'preserves missing-table SQL defects from every repository operation',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const account = makeAccount('first');
      yield* sql`
        drop table account
      `;

      const exits = yield* Effect.all([
        repository.list.pipe(Effect.asVoid, Effect.exit),
        repository.getActive.pipe(Effect.asVoid, Effect.exit),
        repository.getByKey(account).pipe(Effect.asVoid, Effect.exit),
        repository.getByStorageKey(account).pipe(Effect.asVoid, Effect.exit),
        repository.setActive(account).pipe(Effect.asVoid, Effect.exit),
        repository.upsertActive(account).pipe(Effect.asVoid, Effect.exit),
        repository.updateProfile(account).pipe(Effect.asVoid, Effect.exit),
        repository.remove(account).pipe(Effect.asVoid, Effect.exit),
      ]);
      for (const exit of exits) {
        expect(Exit.hasFails(exit)).toBe(false);
        expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SqlError' });
      }
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'keeps COMMIT failures as defects and rolls back the account transaction',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      yield* sql`
        create table commit_parent (id integer primary key)
      `;
      yield* sql`
        create table commit_guard (
          id integer references commit_parent (id) deferrable initially deferred
        )
      `;
      yield* sql`
        create trigger reject_commit after insert on account begin
        insert into
          commit_guard (id)
        values
          (1);

        end
      `;

      // The upsert itself succeeds; only the deferred foreign key at COMMIT fails.
      const exit = yield* repository.upsertActive(makeAccount('second')).pipe(Effect.exit);
      expect(Exit.hasFails(exit)).toBe(false);
      expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({
        _tag: 'SqlError',
        reason: { _tag: 'ConstraintError' },
      });
      expect(yield* repository.list).toEqual(before);
      const guardRows = yield* sql`
        select
          *
        from
          commit_guard
      `;
      expect(guardRows).toEqual([]);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'only recovers connection and lock errors, preserving every other SQL reason as a defect',
    Effect.fnUntraced(function* () {
      const sql = yield* MainDatabase;
      const account = makeAccount('first');
      const cause = new Error('Injected SQL failure');
      const reasons = [
        SqlError.ConnectionError.make({ cause }),
        SqlError.LockTimeoutError.make({ cause }),
        SqlError.AuthenticationError.make({ cause }),
        SqlError.AuthorizationError.make({ cause }),
        SqlError.SqlSyntaxError.make({ cause }),
        SqlError.UniqueViolation.make({ cause, constraint: 'account_identity' }),
        SqlError.ConstraintError.make({ cause }),
        SqlError.DeadlockError.make({ cause }),
        SqlError.SerializationError.make({ cause }),
        SqlError.StatementTimeoutError.make({ cause }),
        SqlError.UnknownError.make({ cause }),
      ];

      for (const reason of reasons) {
        const failure = SqlError.SqlError.make({ reason });
        // Replace only tagged-template execution. SQL helpers and real
        // transaction begin/rollback/finalization stay on the actual client.
        const repository = yield* AccountRepository.make.pipe(
          Effect.provideService(MainDatabase, new Proxy(sql, { apply: () => Effect.fail(failure) }))
        );
        const exits = yield* Effect.all([
          repository.list.pipe(Effect.asVoid, Effect.exit),
          repository.upsertActive(account).pipe(Effect.asVoid, Effect.exit),
        ]);
        for (const exit of exits) {
          if (reason._tag === 'ConnectionError' || reason._tag === 'LockTimeoutError') {
            expect(Exit.hasDies(exit)).toBe(false);
            const error = Result.getOrThrow(Exit.findError(exit));
            expect(error).toBeInstanceOf(AccountDatabaseError);
            expect(error).toMatchObject({ cause: failure });
            expect(error.cause).toBe(failure);
          } else {
            expect(Exit.hasFails(exit)).toBe(false);
            expect(Result.getOrThrow(Exit.findDefect(exit))).toBe(failure);
          }
        }
      }
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'recovers from real write and BEGIN contention without changing the previous active account',
    Effect.fnUntraced(
      function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const path = `${directory}/accounts.db`;
        yield* Effect.gen(function* () {
          const repository = yield* AccountRepository;
          const sql = yield* MainDatabase;
          const contender = yield* TursoSyncClient.make({ path });
          const first = makeAccount('first');
          const second = makeAccount('second');
          yield* repository.upsertActive(first);
          yield* insertAccountFixture({ ...second, active: false });
          const before = yield* repository.list;
          yield* sql`
            pragma busy_timeout = 0
          `;

          yield* contender.withTransaction(
            Effect.gen(function* () {
              const errors = yield* Effect.all([
                repository
                  .updateProfile({ ...first, name: Account.fields.name.make('Updated') })
                  .pipe(Effect.flip),
                repository.setActive(second).pipe(Effect.flip),
                repository.upsertActive(second).pipe(Effect.flip),
              ]);
              for (const error of errors) {
                expect(error).toBeInstanceOf(AccountDatabaseError);
                expect(error).toMatchObject({
                  cause: { _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } },
                });
              }
              expect(yield* repository.list).toEqual(before);
            })
          );

          yield* repository.setActive(second);
          yield* repository.upsertActive(first);
          yield* repository.updateProfile({ ...first, name: Account.fields.name.make('Updated') });
          expect(Option.getOrThrow(yield* repository.getActive)).toMatchObject({
            ...first,
            name: 'Updated',
            active: true,
          });
        }).pipe(
          Effect.provide(
            AccountRepository.layerNoDeps.pipe(
              Layer.provideMerge(MainDatabaseTestLayer),
              Layer.provide(AppConfig.layerTest({ MAIN_DB_FILENAME: path }))
            )
          )
        );
      },
      Effect.provide([BunFileSystem.layer, Reactivity.layer])
    )
  );
});
