import { expect, it } from '@effect/vitest';
import {
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Array, Effect, Exit, Fiber, Latch, Layer, Match, Option } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlClient, Statement } from 'effect/sql';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { PluginFixture, TestScheduler, pluginLayer } from '#src/domains/library/testing.ts';
import { StoragePluginMap } from '#src/domains/plugins/storage/index.ts';
import { StoragePluginKey } from '#src/domains/plugins/storage/schema.ts';

const testLayer = LibraryService.layerNoDeps.pipe(
  Layer.provideMerge([LibraryRepository.layerNoDeps, pluginLayer]),
  Layer.provideMerge(LibraryDatabase.layerNoDeps),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer]),
  Layer.provideMerge(TestScheduler.layer)
);

const mutate = Effect.fnUntraced(function* ({
  id,
  operation,
}: Pick<Library, 'id'> & { readonly operation: 'update' | 'delete' }) {
  const service = yield* LibraryService;
  return yield* Match.value(operation).pipe(
    Match.literalsExhaustive({
      update: () =>
        service
          .update({
            id,
            name: Library.fields.name.make(`Updated ${id}`),
            type: Library.fields.type.make('movie'),
            storagePluginId: Library.fields.storagePluginId.make('npm:test'),
            storagePluginSettings: StoragePluginSettingsInput.make({ root: '/updated' }),
          })
          .pipe(Effect.asVoid),
      delete: () => service.delete({ id }),
    })
  );
});

const activeStorageFor = Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
  const fixture = yield* PluginFixture;
  return Array.filter(
    Array.fromIterable(fixture.activeStorage),
    (storage) => storage.library.id === id
  );
});

const warmLibrary = Effect.fnUntraced(function* (name: string) {
  const repository = yield* LibraryRepository;
  const stores = yield* StoragePluginMap;
  const settings = StoragePluginSettingsPersisted.make({ prefix: '/initial' });
  const row = yield* repository.create({
    name: Library.fields.name.make(name),
    type: Library.fields.type.make('movie'),
    storagePluginId: Library.fields.storagePluginId.make('npm:test'),
    storagePluginSettings: settings,
  });
  const library = { id: row.id };
  const metadata = { id: row.id, type: row.type, name: row.name };
  for (const snapshot of [
    metadata,
    { ...metadata, name: Library.fields.name.make(`${name} stale`) },
  ]) {
    yield* stores
      .acquire(
        StoragePluginKey.make({
          storagePluginId: row.storageKey.storagePluginId,
          library: snapshot,
          settings,
        })
      )
      .pipe(Effect.scoped);
  }
  return { library, row, storage: yield* activeStorageFor(library) };
});

it.layer(testLayer)('library service without transport', (iit) => {
  iit.effect(
    'saves valid settings without constructing unavailable storage on create or update',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const repository = yield* LibraryRepository;
      const stores = yield* StoragePluginMap;
      const input = {
        name: Library.fields.name.make('Unavailable storage'),
        type: Library.fields.type.make('movie'),
        storagePluginId: Library.fields.storagePluginId.make('npm:test'),
        storagePluginSettings: StoragePluginSettingsInput.make({ root: 'unavailable' }),
      };
      const library = yield* service.create(input);
      const created = yield* repository.getById(library);
      expect(created.storageKey.settings).toEqual({ prefix: 'unavailable' });

      const replacement = {
        ...input,
        ...library,
        name: Library.fields.name.make('Updated unavailable storage'),
        storagePluginId: Library.fields.storagePluginId.make('npm:other'),
      };
      yield* service.update(replacement);
      const updated = yield* repository.getById(library);
      expect(updated).toMatchObject({
        name: replacement.name,
        storageKey: {
          storagePluginId: replacement.storagePluginId,
          settings: { prefix: 'unavailable' },
        },
      });
      expect((yield* service.get(library)).storagePluginHealth).toEqual({ status: 'healthy' });
      const construction = yield* stores
        .acquire(updated.storageKey)
        .pipe(Effect.scoped, Effect.flip);
      expect(construction).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      expect((yield* service.get(library)).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [{ _tag: 'StoragePluginConstructionError' }],
      });
    })
  );

  iit.effect.each(['update', 'delete'] as const)(
    '%s retires only its library after the outer commit, never on rollback or savepoint release',
    Effect.fnUntraced(function* (operation) {
      const sql = yield* LibraryDatabase;
      const repository = yield* LibraryRepository;
      const { drainScheduler } = yield* TestScheduler;
      const target = yield* warmLibrary(`${operation} target`);
      const unrelated = yield* warmLibrary(`${operation} unrelated`);
      expect(target.storage).toHaveLength(2);
      expect(unrelated.storage).toHaveLength(2);

      const retainedStorage = target.storage;
      const change = mutate({ ...target.library, operation });
      yield* sql
        .withTransaction(change.pipe(Effect.andThen(Effect.fail('outer rollback'))))
        .pipe(Effect.flip);
      yield* drainScheduler;
      const getByIdResult = yield* repository.getById(target.library);
      expect(getByIdResult).toEqual(target.row);
      const afterRollback = yield* activeStorageFor(target.library);
      expect(afterRollback).toEqual(retainedStorage);

      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql
            .withTransaction(change.pipe(Effect.andThen(Effect.fail('savepoint rollback'))))
            .pipe(Effect.flip);
          yield* drainScheduler;
          const duringSavepointRollback = yield* activeStorageFor(target.library);
          expect(duringSavepointRollback).toEqual(retainedStorage);
        })
      );
      yield* drainScheduler;
      const getByIdResult2 = yield* repository.getById(target.library);
      expect(getByIdResult2).toEqual(target.row);
      const afterSavepointRollback = yield* activeStorageFor(target.library);
      expect(afterSavepointRollback).toEqual(retainedStorage);

      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* change;
          yield* drainScheduler;
          const beforeCommit = yield* activeStorageFor(target.library);
          expect(beforeCommit).toEqual(retainedStorage);
        })
      );
      yield* drainScheduler;
      const afterCommit = yield* activeStorageFor(target.library);
      expect(afterCommit).toEqual([]);
      const unrelatedStorage = yield* activeStorageFor(unrelated.library);
      expect(unrelatedStorage).toEqual(unrelated.storage);
      yield* Match.value(operation).pipe(
        Match.when(
          'delete',
          Effect.fnUntraced(function* () {
            const error = yield* repository.getById(target.library).pipe(Effect.flip);
            expect(error._tag).toBe('LibraryNotFoundError');
          })
        ),
        Match.when(
          'update',
          Effect.fnUntraced(function* () {
            const row = yield* repository.getById(target.library);
            expect(row.name).toBe(`Updated ${target.library.id}`);
            expect(row.storageKey.settings).toEqual({
              prefix: '/updated',
            });
          })
        ),
        Match.exhaustive
      );
    })
  );

  iit.effect.each(['body', 'commit'] as const)(
    'update retirement follows the commit outcome when interrupted during the transaction %s',
    Effect.fnUntraced(function* (boundary) {
      const backing = yield* LibraryDatabase;
      const { drainScheduler } = yield* TestScheduler;
      const target = yield* warmLibrary(`Interrupted ${boundary}`);
      const entered = yield* Latch.make();
      const release = yield* Latch.make();

      const databaseLayer = Layer.effect(
        LibraryDatabase,
        SqlClient.make({
          driver: backing.driver,
          acquirer: backing.reserve,
          compiler: Statement.makeCompilerSqlite(),
          spanAttributes: [],
          beginTransaction: 'BEGIN IMMEDIATE',
          releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
          commit: (connection) =>
            (boundary === 'commit'
              ? entered.open.pipe(Effect.andThen(release.await))
              : Effect.void
            ).pipe(
              Effect.andThen(connection.executeUnprepared('COMMIT', [], void 0)),
              Effect.asVoid
            ),
        }).pipe(
          Effect.map((client) =>
            Object.assign(client, { config: backing.config, syncHandler: backing.syncHandler })
          )
        )
      );

      yield* Effect.gen(function* () {
        const sql = yield* LibraryDatabase;
        const repository = yield* LibraryRepository;
        const request = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* mutate({ ...target.library, operation: 'update' });
              if (boundary === 'body') {
                yield* entered.open;
                return yield* Effect.never;
              }
              return void 0;
            })
          )
          .pipe(Effect.forkChild);
        yield* entered.await;
        const interrupting = yield* Fiber.interrupt(request).pipe(Effect.forkChild);
        yield* drainScheduler;
        yield* release.open;
        yield* Fiber.join(interrupting);
        const requestExit = yield* Fiber.await(request);
        expect(Exit.hasInterrupts(requestExit)).toBe(true);
        yield* drainScheduler;
        const activeStorage = yield* activeStorageFor(target.library);
        expect(activeStorage).toEqual(boundary === 'commit' ? [] : target.storage);
        expect((yield* repository.getById(target.library)).storageKey.settings).toEqual({
          prefix: boundary === 'commit' ? '/updated' : '/initial',
        });
      }).pipe(
        Effect.ensuring(release.open),
        Effect.provide(
          LibraryService.layerNoDeps.pipe(
            Layer.provideMerge(LibraryRepository.layerNoDeps),
            Layer.provideMerge(databaseLayer),
            Layer.fresh
          )
        )
      );
    })
  );

  iit.effect(
    'passes submitted metadata and persisted settings to the selected plugin across plugin changes',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const fixture = yield* PluginFixture;
      const library = yield* service.create({
        name: Library.fields.name.make('Local'),
        type: Library.fields.type.make('movie'),
        storagePluginId: Library.fields.storagePluginId.make('builtin:local'),
        storagePluginSettings: StoragePluginSettingsInput.make({ roots: [] }),
      });
      const submissions: Array<Parameters<typeof fixture.controls.beforeDecode>[0]> = [];
      const { beforeDecode } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          fixture.controls.beforeDecode = beforeDecode;
        })
      );
      fixture.controls.beforeDecode = (request) =>
        Effect.sync(() => {
          submissions.push(request);
        });
      const input = {
        ...library,
        name: Library.fields.name.make('Remote'),
        type: Library.fields.type.make('audiobook'),
        storagePluginId: Library.fields.storagePluginId.make('npm:test@1'),
        storagePluginSettings: StoragePluginSettingsInput.make({ root: '/remote' }),
      };
      yield* service.update(input);
      yield* service.update({
        ...input,
        storagePluginSettings: StoragePluginSettingsInput.make({ root: '/changed' }),
      });
      yield* service.update({
        ...input,
        storagePluginId: Library.fields.storagePluginId.make('npm:test@2'),
      });
      expect(
        Array.map(submissions, ({ library: metadata, current }) => ({ library: metadata, current }))
      ).toEqual([
        { library: { name: 'Remote', type: 'audiobook' }, current: Option.some({ roots: [] }) },
        {
          library: { name: 'Remote', type: 'audiobook' },
          current: Option.some({ prefix: '/remote' }),
        },
        {
          library: { name: 'Remote', type: 'audiobook' },
          current: Option.some({ prefix: '/changed' }),
        },
      ]);
      const updated = yield* service.get(library);
      expect(updated).toMatchObject({
        name: 'Remote',
        type: 'audiobook',
        storagePluginId: 'npm:test@2',
        storagePluginSettings: { prefix: '/remote' },
      });
    })
  );
});
