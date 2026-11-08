import { assert, expect, it } from '@effect/vitest';
import {
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Array, Effect, Exit, Fiber, Latch, Layer, Match, Option, RcMap } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlClient, Statement } from 'effect/sql';

import { Library, LibraryInvalidRootError } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { PluginFixture, TestScheduler, pluginLayer } from '#src/domains/library/testing.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/domains/plugins/storage/index.ts';
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
}: Pick<Library, 'id'> & { readonly operation: 'rename' | 'settings' | 'delete' }) {
  const service = yield* LibraryService;
  return yield* Match.value(operation).pipe(
    Match.literalsExhaustive({
      rename: () =>
        service.rename({ id, name: Library.fields.name.make('Renamed') }).pipe(Effect.asVoid),
      settings: () =>
        service
          .setStoragePluginSettings({
            id,
            input: StoragePluginSettingsInput.make({ root: '/updated' }),
          })
          .pipe(Effect.asVoid),
      delete: () => service.delete({ id }),
    })
  );
});

const cacheKeys = Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
  const stores = yield* StoragePluginMap;
  const keys = yield* RcMap.keys(stores.rcMap);
  return Array.filter(keys, (key) => key.library.id === id);
});

const warmLibrary = Effect.fnUntraced(function* (name: string) {
  const repository = yield* LibraryRepository;
  const editors = yield* StoragePluginSettingsMap;
  const stores = yield* StoragePluginMap;
  const library = yield* repository.create({
    name: Library.fields.name.make(name),
    type: Library.fields.type.make('movie'),
    storagePluginId: Library.fields.storagePluginId.make('npm:test'),
  });
  const settings = StoragePluginSettingsPersisted.make({ prefix: '/initial' });
  yield* repository.setSettings({ ...library, settings });
  const row = yield* repository.getById(library);
  const editor = yield* editors.acquire(row.storagePluginId).pipe(Effect.scoped);
  for (const snapshot of [
    row.library,
    { ...row.library, name: Library.fields.name.make(`${name} stale`) },
  ]) {
    yield* stores
      .acquire(
        StoragePluginKey.make({
          storagePluginId: row.storagePluginId,
          library: snapshot,
          settings,
        })
      )
      .pipe(Effect.scoped);
  }
  return { library, row, editor, keys: yield* cacheKeys(library) };
});

it.layer(testLayer)('library service without transport', (iit) => {
  iit.effect(
    'shares settings editors across previews, creation, and edits with current library inputs',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const repository = yield* LibraryRepository;
      const editors = yield* StoragePluginSettingsMap;
      const fixture = yield* PluginFixture;
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
      const request = {
        name: Library.fields.name.make('Shared settings metadata'),
        type: Library.fields.type.make('movie'),
        storagePluginId: Library.fields.storagePluginId.make('npm:test'),
      };
      const preview = yield* service.getDraftStoragePluginSettingsForm(request);
      expect(preview).toMatchObject([{ label: request.name, initialValue: '' }]);
      const editor = yield* editors.acquire(request.storagePluginId).pipe(Effect.scoped);
      const library = yield* service.create({
        ...request,
        storagePluginSettings: StoragePluginSettingsInput.make({ root: '/initial' }),
        roots: [{ root: '/one' }],
      });
      const keys = yield* cacheKeys(library);
      expect(keys).toEqual([]);
      const name = Library.fields.name.make('Renamed settings metadata');
      yield* service.rename({ ...library, name });
      const form = yield* service.getStoragePluginSettingsForm(library);
      expect(form).toMatchObject([{ label: name, initialValue: '/initial' }]);
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/updated' }),
      });
      expect(submissions).toEqual([
        {
          library: { name: request.name, type: request.type },
          current: Option.none(),
          input: { root: '/initial' },
        },
        {
          library: { name, type: request.type },
          current: Option.some({ prefix: '/initial' }),
          input: { root: '/updated' },
        },
      ]);
      const reused = yield* editors.acquire(request.storagePluginId).pipe(Effect.scoped);
      expect(reused).toBe(editor);
      const row = yield* repository.getById(library);
      expect(Option.map(row.storageKey, ({ settings }) => settings)).toEqual(
        Option.some({ prefix: '/updated' })
      );
    })
  );

  iit.effect(
    'uses repository-decoded identities for acquisition, cache inspection, and invalidation',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const service = yield* LibraryService;
      const editors = yield* StoragePluginSettingsMap;
      const stores = yield* StoragePluginMap;
      yield* editors.invalidate(Library.fields.storagePluginId.make('npm:test'));
      const library = yield* repository.create({
        name: Library.fields.name.make('Decoded plugin identities'),
        type: Library.fields.type.make('movie'),
        storagePluginId: Library.fields.storagePluginId.make('npm:test'),
      });
      const unconfigured = yield* repository.getById(library);
      expect(Option.isNone(unconfigured.storageKey)).toBe(true);
      expect((yield* service.get(library)).storagePluginHealth).toEqual({ status: 'unknown' });

      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: '/decoded' }),
      });
      const configured = yield* repository.getById(library);
      const listResult = yield* repository.list({ cursor: Option.none(), limit: 100 });
      const listed = Option.getOrThrow(
        Array.findFirst(listResult, (row) => row.library.id === library.id)
      );
      const storageKey = Option.getOrThrow(configured.storageKey);
      const listedStorageKey = Option.getOrThrow(listed.storageKey);
      assert.instanceOf(storageKey, StoragePluginKey);
      assert.instanceOf(listedStorageKey, StoragePluginKey);
      expect(configured.library).toEqual({
        ...library,
        name: 'Decoded plugin identities',
        type: 'movie',
      });

      const editor = yield* editors.acquire(unconfigured.storagePluginId);
      const acquireResult = yield* editors.acquire(listed.storagePluginId);
      expect(acquireResult).toBe(editor);
      const storage = yield* stores.acquire(storageKey);
      const acquireResult2 = yield* stores.acquire(listedStorageKey);
      expect(acquireResult2).toBe(storage);
      const contextEffectOptionResult = yield* editors.contextEffectOption(
        configured.storagePluginId
      );
      expect(Option.isSome(contextEffectOptionResult)).toBe(true);
      const contextEffectOptionResult2 = yield* stores.contextEffectOption(listedStorageKey);
      expect(Option.isSome(contextEffectOptionResult2)).toBe(true);
      expect((yield* service.get(library)).storagePluginHealth).toEqual({ status: 'healthy' });

      yield* editors.invalidate(listed.storagePluginId);
      yield* stores.invalidate(listedStorageKey);
      const contextEffectOptionResult3 = yield* editors.contextEffectOption(
        unconfigured.storagePluginId
      );
      expect(Option.isNone(contextEffectOptionResult3)).toBe(true);
      const contextEffectOptionResult4 = yield* stores.contextEffectOption(storageKey);
      expect(Option.isNone(contextEffectOptionResult4)).toBe(true);
      expect((yield* service.get(library)).storagePluginHealth).toEqual({ status: 'unknown' });
    }, Effect.scoped)
  );

  iit.effect.each(['rename', 'settings', 'delete'] as const)(
    '%s retires only its library after the outer commit, never on rollback or savepoint release',
    Effect.fnUntraced(function* (operation) {
      const sql = yield* LibraryDatabase;
      const repository = yield* LibraryRepository;
      const { drainScheduler } = yield* TestScheduler;
      const target = yield* warmLibrary(`${operation} target`);
      const unrelated = yield* warmLibrary(`${operation} unrelated`);
      expect(target.keys).toHaveLength(2);
      expect(target.editor).toBe(unrelated.editor);

      const change = mutate({ ...target.library, operation });
      yield* sql
        .withTransaction(change.pipe(Effect.andThen(Effect.fail('outer rollback'))))
        .pipe(Effect.flip);
      yield* drainScheduler;
      const getByIdResult = yield* repository.getById(target.library);
      expect(getByIdResult).toEqual(target.row);
      const cacheKeysResult = yield* cacheKeys(target.library);
      expect(cacheKeysResult).toEqual(target.keys);

      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql
            .withTransaction(change.pipe(Effect.andThen(Effect.fail('savepoint rollback'))))
            .pipe(Effect.flip);
          yield* drainScheduler;
          const cacheKeysResult2 = yield* cacheKeys(target.library);
          expect(cacheKeysResult2).toEqual(target.keys);
        })
      );
      yield* drainScheduler;
      const getByIdResult2 = yield* repository.getById(target.library);
      expect(getByIdResult2).toEqual(target.row);
      const cacheKeysResult3 = yield* cacheKeys(target.library);
      expect(cacheKeysResult3).toEqual(target.keys);

      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* change;
          yield* drainScheduler;
          const cacheKeysResult4 = yield* cacheKeys(target.library);
          expect(cacheKeysResult4).toEqual(target.keys);
        })
      );
      yield* drainScheduler;
      const cacheKeysResult5 = yield* cacheKeys(target.library);
      expect(cacheKeysResult5).toEqual([]);
      const editors = yield* StoragePluginSettingsMap;
      const editor = yield* editors.acquire(target.row.storagePluginId).pipe(Effect.scoped);
      expect(editor).toBe(target.editor);
      const cacheKeysResult6 = yield* cacheKeys(unrelated.library);
      expect(cacheKeysResult6).toEqual(unrelated.keys);
      yield* Match.value(operation).pipe(
        Match.when(
          'delete',
          Effect.fnUntraced(function* () {
            const error = yield* repository.getById(target.library).pipe(Effect.flip);
            expect(error._tag).toBe('LibraryNotFoundError');
          })
        ),
        Match.whenOr(
          'rename',
          'settings',
          Effect.fnUntraced(function* () {
            const row = yield* repository.getById(target.library);
            expect(row.library.name).toBe(
              operation === 'rename' ? 'Renamed' : target.row.library.name
            );
            expect(Option.map(row.storageKey, ({ settings }) => settings)).toEqual(
              Option.some({ prefix: operation === 'settings' ? '/updated' : '/initial' })
            );
          })
        ),
        Match.exhaustive
      );
    })
  );

  iit.effect.each(['body', 'commit'] as const)(
    'settings retirement follows the commit outcome when interrupted during the transaction %s',
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
              yield* mutate({ ...target.library, operation: 'settings' });
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
        const cacheKeysResult = yield* cacheKeys(target.library);
        expect(cacheKeysResult).toEqual(boundary === 'commit' ? [] : target.keys);
        expect(
          Option.map(
            (yield* repository.getById(target.library)).storageKey,
            ({ settings }) => settings
          )
        ).toEqual(Option.some({ prefix: boundary === 'commit' ? '/updated' : '/initial' }));
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
    'reports a raw empty root as a typed validation error without changing configured roots',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const library = yield* service.create({
        name: Library.fields.name.make('Direct root validation'),
        type: Library.fields.type.make('movie'),
        storagePluginId: Library.fields.storagePluginId.make('npm:test'),
        storagePluginSettings: StoragePluginSettingsInput.make({ root: '/configured' }),
        roots: [],
      });
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/configured' }),
      });
      yield* service.setRoots({ ...library, roots: [{ root: '/one' }, { root: '/two' }] });
      const before = yield* service.get(library);
      expect(before.storagePluginSettings).toEqual(Option.some({ prefix: '/configured' }));
      expect(Array.map(before.roots, ({ root }) => root)).toEqual(['/one', '/two']);

      const error = yield* service
        .setRoots({ ...library, roots: [{ root: '/replacement' }, { root: '' }] })
        .pipe(Effect.flip);
      assert.instanceOf(error, LibraryInvalidRootError);
      expect({ _tag: error._tag, roots: error.roots }).toEqual({
        _tag: 'LibraryInvalidRootError',
        roots: [{ root: '', message: 'Expected a value with a length of at least 1' }],
      });
      const after = yield* service.get(library);
      expect({ settings: after.storagePluginSettings, roots: after.roots }).toEqual({
        settings: Option.some({ prefix: '/configured' }),
        roots: before.roots,
      });
    })
  );
});
