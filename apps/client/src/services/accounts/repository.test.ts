/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';

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

      const error = yield* repository
        .upsertActive({
          ...second,
          authStorageId: Account.fields.authStorageId.make('replacement-credentials'),
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(AccountDatabaseError);
      expect(error.cause).toMatchObject({ _tag: 'SqlError' });
      expect(yield* repository.list).toEqual(before);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'retains schema encoding failures as persistence causes and rolls back deactivation',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      yield* repository.upsertActive(makeAccount('first'));
      const before = yield* repository.list;
      const error = yield* repository
        .upsertActive({
          ...makeAccount('second'),
          // Simulate a runtime caller violating the branded request contract.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentionally invalid runtime input
          role: 'invalid-role' as AccountUpsert['role'],
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(AccountDatabaseError);
      expect(error.cause).toMatchObject({ _tag: 'SchemaError' });
      expect(yield* repository.list).toEqual(before);
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'exposes consistent domain errors for invalid persisted rows across UI queries',
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

      const errors = yield* Effect.all([
        repository.list.pipe(Effect.flip),
        repository.getActive.pipe(Effect.flip),
        repository.getByKey(account).pipe(Effect.flip),
        repository.getByStorageKey(account).pipe(Effect.flip),
      ]);
      for (const error of errors) {
        expect(error).toBeInstanceOf(AccountDatabaseError);
        expect(error).toMatchObject({ cause: { _tag: 'SchemaError' } });
      }
    }, Effect.provide(RepositoryTestLayer))
  );

  it.effect(
    'exposes domain errors retaining SQL causes from every repository operation',
    Effect.fnUntraced(function* () {
      const repository = yield* AccountRepository;
      const sql = yield* MainDatabase;
      const account = makeAccount('first');
      yield* sql`
        drop table account
      `;

      const errors = yield* Effect.all([
        repository.list.pipe(Effect.flip),
        repository.getActive.pipe(Effect.flip),
        repository.getByKey(account).pipe(Effect.flip),
        repository.getByStorageKey(account).pipe(Effect.flip),
        repository.setActive(account).pipe(Effect.flip),
        repository.upsertActive(account).pipe(Effect.flip),
        repository.updateProfile(account).pipe(Effect.flip),
        repository.remove(account).pipe(Effect.flip),
      ]);
      for (const error of errors) {
        expect(error).toBeInstanceOf(AccountDatabaseError);
        expect(error).toMatchObject({ cause: { _tag: 'SqlError' } });
      }
    }, Effect.provide(RepositoryTestLayer))
  );
});
