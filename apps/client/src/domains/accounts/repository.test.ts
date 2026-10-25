import { BunFileSystem } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, FileSystem, Layer, Option, Record, Result } from 'effect';
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
import { AccountDatabaseError, AccountNotFoundError } from '#src/domains/accounts/errors.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account, ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { insertAccountFixture } from '#src/domains/accounts/testing.ts';

const RepositoryTestLayer = AccountRepository.layerNoDeps.pipe(
  Layer.provideMerge(MainDatabaseTestLayer),
  Layer.provideMerge(Reactivity.layer),
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
  }) satisfies typeof Account.upsert.Type;

describe('AccountRepository', () => {
  it.effect(
    'publishes each repository write once, only after the outermost transaction commits',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const reactivity = yield* Reactivity.Reactivity;
      const first = makeAccount('first');
      const second = makeAccount('second');
      yield* repository.upsertActive(first);
      const invalidations = { count: 0 };
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          reactivity.registerUnsafe(['account'], () => {
            invalidations.count += 1;
          })
        ),
        (unregister) => Effect.sync(unregister)
      );

      const writes = [
        repository.upsertActive(second),
        repository.setActive(first),
        repository.updateProfile({ ...first, name: Account.fields.name.make('Updated') }),
        repository.remove(first),
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
      expect(yield* repository.list).toMatchObject([{ ...second, active: false }]);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'discards repository invalidations and writes when an outer transaction rolls back',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const reactivity = yield* Reactivity.Reactivity;
      const first = makeAccount('first');
      const second = makeAccount('second');
      yield* repository.upsertActive(first);
      const before = yield* repository.list;
      const invalidations = { count: 0 };
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          reactivity.registerUnsafe(['account'], () => {
            invalidations.count += 1;
          })
        ),
        (unregister) => Effect.sync(unregister)
      );

      const error = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* repository.upsertActive(second);
            yield* repository.setActive(first);
            yield* repository.updateProfile({
              ...first,
              name: Account.fields.name.make('Updated'),
            });
            yield* repository.remove(second);
            expect(invalidations.count).toBe(0);
            return yield* Effect.fail('Roll back account changes');
          })
        )
        .pipe(Effect.flip);

      expect(error).toBe('Roll back account changes');
      expect(invalidations.count).toBe(0);
      expect(yield* repository.list).toEqual(before);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'atomically selects an existing account and converges on repeated selection',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const first = makeAccount('first');
      const second = makeAccount('second');
      expect(yield* repository.getActiveKey).toEqual(Option.none());
      yield* repository.upsertActive(first);
      yield* insertAccountFixture({ ...second, active: false });

      yield* repository.setActive(second);
      yield* repository.setActive(second);

      expect(yield* repository.list).toMatchObject([
        { userId: first.userId, active: false },
        { userId: second.userId, active: true },
      ]);
      const key = Option.getOrThrow(yield* repository.getActiveKey);
      expect(key).toBeInstanceOf(ActiveAccountKey);
      expect(Record.keys(key).sort()).toEqual(['authStorageId', 'serverUrl', 'userId']);
      expect(key).toEqual(ActiveAccountKey.make(second));

      yield* repository.updateProfile({ ...second, name: Account.fields.name.make('Updated') });
      expect(yield* repository.getActiveKey).toEqual(Option.some(key));
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'rolls back selection of a missing account without changing the previous active row',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      const missing = makeAccount('missing');
      expect(before).toMatchObject([{ userId: 'first', active: true }]);

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
      expect(Option.getOrThrow(yield* repository.getByStorageKey(replacement))).toMatchObject({
        userId: 'first',
        authStorageId: 'replacement-credentials',
        name: 'Updated profile',
        active: true,
      });
      // Events/removals from old credentials must not affect the replacement sign-in.
      yield* repository.updateProfile({
        ...first,
        name: Account.fields.name.make('Stale profile'),
      });
      yield* repository.remove(first);
      expect(yield* repository.getActiveKey).toEqual(
        Option.some(ActiveAccountKey.make(replacement))
      );
      expect(yield* repository.getByKey(replacement)).toMatchObject({
        userId: 'first',
        authStorageId: 'replacement-credentials',
        name: 'Updated profile',
        active: true,
      });
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
      expect(before).toMatchObject([
        { userId: 'first', active: true },
        { userId: 'second', authStorageId: 'second-credentials', active: false },
      ]);
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
    'preserves a schema defect when reading a corrupt persisted account',
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

      const exit = yield* repository.getByKey(account).pipe(Effect.exit);
      expect(Exit.hasFails(exit)).toBe(false);
      expect(Result.getOrThrow(Exit.findDefect(exit))).toMatchObject({ _tag: 'SchemaError' });
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'reports connection acquisition failure as a recoverable database error',
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
      }).pipe(Effect.provide(Reactivity.layer));
      const repository = yield* AccountRepository.make.pipe(
        Effect.provideService(MainDatabase, Object.assign(client, { pull: database.pull }))
      );

      const error = yield* repository.list.pipe(Effect.flip);
      expect(error).toBeInstanceOf(AccountDatabaseError);
      expect(error.cause).toBe(failure);
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
          yield* repository.updateProfile({ ...second, name: Account.fields.name.make('Updated') });
          expect(yield* repository.getActiveKey).toEqual(
            Option.some(ActiveAccountKey.make(second))
          );
          expect(yield* repository.getByKey(second)).toMatchObject({
            ...second,
            name: 'Updated',
            active: true,
          });
        }).pipe(
          Effect.provide(
            AccountRepository.layerNoDeps.pipe(
              Layer.provideMerge(MainDatabaseTestLayer),
              Layer.provide(Reactivity.layer),
              Layer.provide(AppConfig.layerTest({ MAIN_DB_FILENAME: path }))
            )
          )
        );
      },
      Effect.provide([BunFileSystem.layer, Reactivity.layer])
    )
  );
});
