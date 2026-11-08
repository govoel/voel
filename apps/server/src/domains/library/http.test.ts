import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import {
  StorageLocationValidationError,
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Array, Effect, Exit, Fiber, Latch, Layer, Option, Schema, pipe } from 'effect';
import {
  Headers,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpEffect,
  HttpRouter,
} from 'effect/http';
import { HttpApiClient, HttpApiMiddleware, HttpApiTest } from 'effect/http-api';
import { Reactivity } from 'effect/reactivity';
import { TestClock } from 'effect/testing';

import { TursoClient } from '@repo/effect-turso';
import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/domains/auth/http.ts';
import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { AuthDatabase } from '#src/domains/auth/database/index.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/domains/auth/http.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryHandlersLayerNoDeps } from '#src/domains/library/http.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { Input, PluginFixture, TestScheduler, pluginLayer } from '#src/domains/library/testing.ts';
import { StoragePluginSettingsMap } from '#src/domains/plugins/storage/index.ts';
import { ApiRoutesLayerNoDeps } from '#src/http.ts';
import { makeAuthedClient } from '#src/testing/http.ts';

const testDependenciesLayer = Layer.mergeAll(
  AuthMiddlewareLayerNoDeps,
  AdminMiddlewareLayerNoDeps,
  LibraryRepository.layerNoDeps,
  pluginLayer
).pipe(
  Layer.provideMerge(AuthLayerNoDeps),
  Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer]),
  Layer.provideMerge(BunHttpServer.layerHttpServices)
);

const testLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provideMerge(LibraryService.layerNoDeps.pipe(Layer.provideMerge(testDependenciesLayer))),
  Layer.provideMerge(TestScheduler.layer)
);

const wireTestLayer = ApiRoutesLayerNoDeps.pipe(
  Layer.provideMerge(LibraryService.layerNoDeps.pipe(Layer.provideMerge(testDependenciesLayer))),
  Layer.provideMerge(HttpRouter.layer)
);

const createInput = (
  name: string,
  pluginId: 'builtin:local' | `npm:${string}` = 'builtin:local'
) => ({
  name: Library.fields.name.make(name),
  type: Library.fields.type.make('movie'),
  storagePluginId: Library.fields.storagePluginId.make(pluginId),
  storagePluginSettings: StoragePluginSettingsInput.make(
    pluginId === 'builtin:local' ? {} : { root: '/initial' }
  ),
  roots: [],
});
const createRecord = (...args: Parameters<typeof createInput>) => {
  const request = createInput(...args);
  return {
    ...request,
    storagePluginSettings: StoragePluginSettingsPersisted.make(
      request.storagePluginId === 'builtin:local' ? {} : { prefix: '/initial' }
    ),
  };
};
const makeClient = Effect.gen(function* () {
  const auth = yield* makeAuthedClient({ username: 'libraryadmin', role: 'admin' });
  return yield* HttpApiTest.groups(Api, ['library']).pipe(Effect.provide(auth.layer));
});

it.layer(testLayer)('library lifecycle', (iit) => {
  iit.effect(
    'collects cached failures from both plugin components',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository.make;
      const libraryRecord = yield* repository.create(createRecord('Failed health', 'npm:missing'));
      const library = { id: libraryRecord.storageKey.library.id };
      yield* repository.update({
        ...createRecord('Failed health', 'npm:missing'),
        ...library,
        storagePluginSettings: StoragePluginSettingsPersisted.make({}),
      });
      const getStoragePluginSettingsFormError = yield* client.library
        .getStoragePluginSettingsForm({ params: library })
        .pipe(Effect.flip);
      expect(getStoragePluginSettingsFormError).toMatchObject({ _tag: 'PluginLoadError' });
      const setRootsError = yield* client.library
        .setRoots({ params: library, payload: { roots: [] } })
        .pipe(Effect.flip);
      expect(setRootsError).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [
          { _tag: 'PluginLoadError', message: 'Plugin unavailable' },
          { _tag: 'PluginLoadError', message: 'Plugin unavailable' },
        ],
      });
    })
  );

  iit.effect(
    'reads cached plugin health and retires only library-specific storage',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const { drainScheduler } = yield* TestScheduler;
      const repository = yield* LibraryRepository;
      const editors = yield* StoragePluginSettingsMap;
      yield* editors.invalidate(Library.fields.storagePluginId.make('npm:test'));
      const libraryRecord = yield* repository.create(createRecord('Health', 'npm:test'));
      const library = { id: libraryRecord.storageKey.library.id };
      const listItem = Effect.gen(function* () {
        return Option.getOrThrow(
          Array.findFirst(
            (yield* client.library.list({
              query: { cursor: Option.none(), limit: 100 },
            })).items,
            ({ id }) => id === library.id
          )
        );
      });
      for (let index = 0; index < 2; index += 1) {
        expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
          status: 'unknown',
        });
        const listItem2 = yield* listItem;
        expect(listItem2).toMatchObject({ storagePluginStatus: 'unknown' });
      }

      yield* repository.update({
        ...createRecord('Health', 'npm:test'),
        ...library,
        storagePluginSettings: StoragePluginSettingsPersisted.make({ prefix: 'unavailable' }),
      });
      yield* drainScheduler;
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      const listItem3 = yield* listItem;
      expect(listItem3).toMatchObject({ storagePluginStatus: 'healthy' });

      yield* client.library.setRoots({ params: library, payload: { roots: [] } }).pipe(Effect.flip);
      for (let index = 0; index < 2; index += 1) {
        expect((yield* client.library.get({ params: library })).storagePluginHealth).toMatchObject({
          status: 'unhealthy',
          errors: [{ _tag: 'StoragePluginConstructionError', message: 'Storage unavailable' }],
        });
        const item = yield* listItem;
        expect(item).toMatchObject({ storagePluginStatus: 'unhealthy' });
        expect(item).not.toHaveProperty('storagePluginHealth');
      }

      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/healthy' }) },
      });
      yield* drainScheduler;
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      yield* client.library.setRoots({ params: library, payload: { roots: [] } });
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      const listItem4 = yield* listItem;
      expect(listItem4).toMatchObject({ storagePluginStatus: 'healthy' });

      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('New health') },
      });
      yield* drainScheduler;
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      const listItem5 = yield* listItem;
      expect(listItem5).toMatchObject({ storagePluginStatus: 'healthy' });
    })
  );

  iit.effect(
    'excludes obsolete storage failures without discarding plugin-wide editor health',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository.make;
      const editors = yield* StoragePluginSettingsMap;
      const library = yield* client.library.create({
        payload: createInput('Stale health', 'npm:test'),
      });
      yield* editors.invalidate(Library.fields.storagePluginId.make('npm:test'));
      yield* repository.update({
        ...createRecord('Stale health', 'npm:test'),
        ...library,
        storagePluginSettings: StoragePluginSettingsPersisted.make({ prefix: 'unavailable' }),
      });
      yield* client.library.setRoots({ params: library, payload: { roots: [] } }).pipe(Effect.flip);
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'unhealthy'
      );

      yield* repository.update({
        ...createRecord('Stale health', 'npm:test'),
        ...library,
        storagePluginSettings: StoragePluginSettingsPersisted.make({ prefix: '/current' }),
      });
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'unknown'
      );
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'healthy'
      );
      yield* repository.update({
        ...createRecord('Stale health', 'npm:test'),
        storagePluginSettings: StoragePluginSettingsPersisted.make({ prefix: '/current' }),
        ...library,
        name: Library.fields.name.make('New health context'),
      });
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'healthy'
      );
      expect(
        Option.getOrThrow(
          Array.findFirst(
            (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items,
            ({ id }) => id === library.id
          )
        )
      ).toMatchObject({ storagePluginStatus: 'healthy' });
    })
  );

  iit.effect(
    'creates configured local storage and validates roots immediately',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const sql = yield* LibraryDatabase;
      const library = yield* client.library.create({ payload: createInput('Local') });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({});
      const rows = yield* sql`
        select
          "storagePluginSettings"
        from
          library
        where
          id = ${library.id}
      `;
      expect(rows).toEqual([{ storagePluginSettings: '{}' }]);
      const form = yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect(form).toEqual([]);
      yield* client.library.setRoots({ params: library, payload: { roots: [] } });
      const error = yield* client.library
        .setRoots({ params: library, payload: { roots: [{ root: 'relative' }] } })
        .pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [{ root: 'relative', message: 'Library root locations must be absolute paths' }],
      });
    })
  );

  iit.effect(
    'reports all rejected roots with their messages without changing persisted roots',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const library = yield* client.library.create({ payload: createInput('Invalid roots') });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({}) },
      });
      yield* client.library.setRoots({
        params: library,
        payload: { roots: [{ root: '/original' }] },
      });
      const setRootsError = yield* client.library
        .setRoots({
          params: library,
          payload: { roots: [{ root: 'relative' }, { root: '/valid' }, { root: '/nul\0' }] },
        })
        .pipe(Effect.flip);
      expect(setRootsError).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [
          { root: 'relative', message: 'Library root locations must be absolute paths' },
          { root: '/nul\0', message: 'Library root locations must not contain NUL characters' },
        ],
      });
      expect(
        Array.map((yield* client.library.get({ params: library })).roots, ({ root }) => root)
      ).toEqual(['/original']);
    })
  );

  iit.effect(
    'defers plugin loading and rejects name conflicts without resurrecting rows',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository;
      const editors = yield* StoragePluginSettingsMap;
      yield* editors.invalidate(Library.fields.storagePluginId.make('npm:missing'));
      const missingRecord = yield* repository.create(createRecord('Missing plugin', 'npm:missing'));
      const missing = { id: missingRecord.storageKey.library.id };
      const resultValue = yield* client.library.get({ params: missing });
      expect(resultValue).toMatchObject({
        storagePluginId: 'npm:missing',
        storagePluginSettings: { prefix: '/initial' },
        storagePluginHealth: { status: 'unknown' },
      });
      const getStoragePluginSettingsFormError = yield* client.library
        .getStoragePluginSettingsForm({ params: missing })
        .pipe(Effect.flip);
      expect(getStoragePluginSettingsFormError).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* client.library.get({ params: missing })).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [{ _tag: 'PluginLoadError', message: 'Plugin unavailable' }],
      });
      expect(
        Option.getOrThrow(
          Array.findFirst(
            (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items,
            ({ id }) => id === missing.id
          )
        )
      ).toMatchObject({ storagePluginStatus: 'unhealthy' });
      const original = yield* client.library.create({ payload: createInput('Unique') });
      const createError = yield* client.library
        .create({ payload: createInput('Unique') })
        .pipe(Effect.flip);
      expect(createError).toMatchObject({
        _tag: 'LibraryNameConflictError',
        name: '@repo/spec-api/domains/library/schema/LibraryNameConflictError',
        libraryName: 'Unique',
      });
      const other = yield* client.library.create({ payload: createInput('Other') });
      const updateError = yield* client.library
        .update({ params: other, payload: { name: Library.fields.name.make('Unique') } })
        .pipe(Effect.flip);
      expect(updateError).toMatchObject({
        _tag: 'LibraryNameConflictError',
        name: '@repo/spec-api/domains/library/schema/LibraryNameConflictError',
        libraryName: 'Unique',
      });
      expect((yield* client.library.get({ params: other })).name).toBe('Other');
      yield* client.library.delete({ params: original });
      yield* client.library.delete({ params: original });
      const updateError2 = yield* client.library
        .update({ params: original, payload: { name: Library.fields.name.make('Gone') } })
        .pipe(Effect.flip);
      expect(updateError2).toMatchObject({ _tag: 'LibraryNotFoundError', id: original.id });
      const recreated = yield* client.library.create({ payload: createInput('Unique') });
      expect(recreated.id).not.toBe(original.id);
    })
  );

  iit.effect(
    'round-trips transformed settings, retries edits with stable identity, and isolates libraries',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const repository = yield* LibraryRepository;
      const libraryRecord = yield* repository.create(createRecord('Remote', 'npm:test'));
      const library = { id: libraryRecord.storageKey.library.id };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const getStoragePluginSettingsFormResult =
          yield* client.library.getStoragePluginSettingsForm({ params: library });
        expect(getStoragePluginSettingsFormResult).toEqual([
          {
            _tag: 'TextField',
            name: 'root',
            label: 'Remote',
            placeholder: '',
            initialValue: '/initial',
          },
        ]);
      }
      const failure = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: 123 }) },
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: 'StoragePluginInvalidSettingsError',
        message: 'Submitted storage plugin settings failed validation',
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
        prefix: '/initial',
      });
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      const setStoragePluginSettingsError = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: 'unavailable' }) },
        })
        .pipe(Effect.flip);
      expect(setStoragePluginSettingsError).toMatchObject({
        _tag: 'StoragePluginConstructionError',
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
        prefix: '/initial',
      });
      yield* repository.update({
        ...createRecord('Remote', 'npm:test'),
        ...library,
        storagePluginSettings: StoragePluginSettingsPersisted.make({ prefix: 'unavailable' }),
      });
      const setRootsError = yield* client.library
        .setRoots({ params: library, payload: { roots: [] } })
        .pipe(Effect.flip);
      expect(setRootsError).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      const getStoragePluginSettingsFormResult2 =
        yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect(getStoragePluginSettingsFormResult2).toMatchObject([
        { initialValue: 'unavailable', label: 'Remote' },
      ]);
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: ' /remote ' }) },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
        prefix: '/remote',
      });
      const getStoragePluginSettingsFormResult3 =
        yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect(getStoragePluginSettingsFormResult3).toMatchObject([
        { initialValue: '/remote', label: 'Remote' },
      ]);
      yield* client.library.setRoots({
        params: library,
        payload: { roots: [{ root: ' /one ' }, { root: '/one' }] },
      });
      expect(
        Array.map((yield* client.library.get({ params: library })).roots, ({ root }) => root)
      ).toEqual(['/one']);
      yield* client.library.setRoots({ params: library, payload: { roots: [{ root: '/one' }] } });
      expect(
        Array.map((yield* client.library.get({ params: library })).roots, ({ root }) => root)
      ).toEqual(['/one']);
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Rejected') },
      });
      expect((yield* client.library.get({ params: library })).name).toBe('Rejected');
      const setRootsError2 = yield* client.library
        .setRoots({ params: library, payload: { roots: [] } })
        .pipe(Effect.flip);
      expect(setRootsError2).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Renamed') },
      });
      const getStoragePluginSettingsFormResult4 =
        yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect(getStoragePluginSettingsFormResult4).toMatchObject([
        { label: 'Renamed', initialValue: '/remote' },
      ]);
      const secondRecord = yield* repository.create(createRecord('Second remote', 'npm:test'));
      const second = { id: secondRecord.storageKey.library.id };
      const getStoragePluginSettingsFormResult5 =
        yield* client.library.getStoragePluginSettingsForm({ params: second });
      expect(getStoragePluginSettingsFormResult5).toEqual([
        {
          _tag: 'TextField',
          name: 'root',
          label: 'Second remote',
          placeholder: '',
          initialValue: '/initial',
        },
      ]);
      const { invalidForm } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          fixture.controls.invalidForm = invalidForm;
        })
      );
      fixture.controls.invalidForm = true;
      const formExit = yield* client.library
        .getStoragePluginSettingsForm({ params: second })
        .pipe(Effect.exit);
      expect(Exit.hasDies(formExit)).toBe(true);
      expect(Exit.findDefect(formExit)).toMatchObject({
        _tag: 'Success',
        success: { _tag: 'SchemaError' },
      });
      fixture.controls.invalidForm = invalidForm;
      yield* client.library.setRoots({ params: library, payload: { roots: [] } });
      expect((yield* client.library.get({ params: library })).roots).toEqual([]);
    })
  );

  iit.effect(
    'returns before idle plugin cleanup finishes and retires beyond the request scope',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const { drainScheduler } = yield* TestScheduler;
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({
        payload: createInput('Background retirement', 'npm:test'),
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/background' }) },
      });
      yield* client.library.setRoots({ params: library, payload: { roots: [{ root: '/one' }] } });

      const started = yield* Latch.make();
      const release = yield* Latch.make();
      const finished = yield* Latch.make();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? started.open.pipe(
              Effect.andThen(release.await),
              Effect.andThen(finished.open),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        release.open.pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.onFinalize = () => Effect.void;
            })
          )
        )
      );

      const response = yield* Effect.scoped(
        client.library.update({
          params: library,
          payload: { name: Library.fields.name.make('Background renamed') },
        })
      );
      expect(response).toEqual(library);
      yield* drainScheduler;
      expect(started.isOpen()).toBe(true);
      expect(finished.isOpen()).toBe(false);
      expect((yield* client.library.get({ params: library })).name).toBe('Background renamed');
      const getStoragePluginSettingsFormResult = yield* client.library.getStoragePluginSettingsForm(
        { params: library }
      );
      expect(getStoragePluginSettingsFormResult).toMatchObject([
        { label: 'Background renamed', initialValue: '/background' },
      ]);
      expect(
        Array.map((yield* client.library.get({ params: library })).roots, ({ root }) => root)
      ).toEqual(['/one']);
      yield* release.open;
      yield* finished.await;
    })
  );

  iit.effect(
    'holds the write lock throughout root decoding and releases it after replacement',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const config = yield* ApiConfig;
      const contender = yield* TursoClient.make({
        filename: config.db.libraryFilename,
        busyTimeout: 0,
      });
      const library = yield* client.library.create({
        payload: createInput('Locked root context', 'npm:test'),
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/initial' }) },
      });
      yield* client.library.setRoots({
        params: library,
        payload: { roots: [{ root: '/original' }] },
      });
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      fixture.controls.beforeRootDecode = (request) =>
        request.library.id === library.id && request.location === '/pending'
          ? started.open.pipe(Effect.andThen(release.await), Effect.asVoid)
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        release.open.pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.beforeRootDecode = () => Effect.void;
            })
          )
        )
      );
      const pending = yield* client.library
        .setRoots({ params: library, payload: { roots: [{ root: '/pending' }] } })
        .pipe(Effect.forkChild);
      yield* started.await;
      const rowsError = yield* contender`
          update library
          set
            name = 'Renamed root context'
          where
            id = ${library.id}
        `.pipe(Effect.flip);
      expect(rowsError).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      const rowsError2 = yield* contender`
          update library
          set
            "storagePluginSettings" = '{"prefix":"/updated"}'
          where
            id = ${library.id}
        `.pipe(Effect.flip);
      expect(rowsError2).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      const resultValue = yield* client.library.get({ params: library });
      expect(resultValue).toMatchObject({
        name: 'Locked root context',
        storagePluginSettings: { prefix: '/initial' },
        roots: [{ root: '/original' }],
      });
      yield* release.open;
      const pendingValue = yield* Fiber.join(pending);
      expect(pendingValue).toEqual({ ...library, roots: [{ root: '/pending' }] });
      expect(
        Array.map((yield* client.library.get({ params: library })).roots, ({ root }) => root)
      ).toEqual(['/pending']);
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Renamed root context') },
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/updated' }) },
      });
      const resultValue2 = yield* client.library.get({ params: library });
      expect(resultValue2).toMatchObject({
        name: 'Renamed root context',
        storagePluginSettings: { prefix: '/updated' },
      });
    })
  );

  iit.effect(
    'concurrent renames and settings edits commit only their own fields',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({
        payload: createInput('Concurrent metadata', 'npm:test'),
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/initial' }) },
      });
      const settingsStarted = yield* Latch.make();
      const settingsRelease = yield* Latch.make();
      fixture.controls.beforeDecode = (request) =>
        request.library.name === 'Concurrent metadata' &&
        Input.is(request.input) &&
        request.input.root === '/pending-settings'
          ? settingsStarted.open.pipe(Effect.andThen(settingsRelease.await))
          : Effect.void;
      const settings = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/pending-settings' }) },
        })
        .pipe(Effect.forkChild);
      yield* settingsStarted.await;
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Final name') },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
        prefix: '/initial',
      });
      yield* settingsRelease.open;
      yield* Fiber.join(settings);
      const resultValue = yield* client.library.get({ params: library });
      expect(resultValue).toMatchObject({
        name: 'Final name',
        storagePluginSettings: { prefix: '/pending-settings' },
      });
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'concurrent settings submissions are last-write-wins',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({
        payload: createInput('Concurrent settings', 'npm:test'),
      });
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      fixture.controls.beforeDecode = (request) =>
        request.library.name === 'Concurrent settings' &&
        Input.is(request.input) &&
        request.input.root === '/slow'
          ? started.open.pipe(Effect.andThen(release.await), Effect.asVoid)
          : Effect.void;
      const slow = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/slow' }) },
        })
        .pipe(Effect.forkChild);
      yield* started.await;
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/fast' }) },
      });
      yield* release.open;
      yield* Fiber.join(slow);
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
        prefix: '/slow',
      });
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'deletion during settings decoding returns not-found and releases storage',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({
        payload: createInput('Delete pending settings', 'npm:test'),
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/initial' }) },
      });
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      yield* client.library.setRoots({ params: library, payload: { roots: [{ root: '/one' }] } });
      expect(
        Array.map(
          Array.filter([...fixture.activeStorage], ({ library: row }) => row.id === library.id),
          ({ settings }) => settings
        )
      ).toEqual([{ prefix: '/initial' }]);
      const retired = yield* Latch.make();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id ? retired.open.pipe(Effect.asVoid) : Effect.void;
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      fixture.controls.beforeDecode = (request) =>
        request.library.name === 'Delete pending settings'
          ? started.open.pipe(Effect.andThen(release.await), Effect.asVoid)
          : Effect.void;
      const pending = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/deleted' }) },
        })
        .pipe(Effect.flip, Effect.forkChild);
      yield* started.await;
      yield* client.library.delete({ params: library });
      yield* retired.await;
      expect(
        Array.filter([...fixture.activeStorage], ({ library: row }) => row.id === library.id)
      ).toEqual([]);
      yield* release.open;
      const pendingValue = yield* Fiber.join(pending);
      expect(pendingValue).toMatchObject({ _tag: 'LibraryNotFoundError' });
      const resultValueError = yield* client.library.get({ params: library }).pipe(Effect.flip);
      expect(resultValueError).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
      fixture.controls.onFinalize = () => Effect.void;
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'hard deletion cascades roots and mappings but preserves shared media',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const sql = yield* LibraryDatabase;
      const library = yield* client.library.create({ payload: createInput('Delete cascade') });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({}) },
      });
      yield* client.library.setRoots({
        params: library,
        payload: { roots: [{ root: '/delete' }] },
      });
      yield* sql`
        insert into
          "mediaFile" (location, "durationMs")
        values
          ('/shared', 100)
      `;
      yield* sql`
        insert into
          "libraryFileMap" (
            "libraryId",
            "mediaFileId",
            "matchFailureReason",
            "customOrder"
          )
        select
          ${library.id},
          id,
          'unmatched',
          0
        from
          "mediaFile"
        where
          location = '/shared'
      `;
      const rows = yield* sql`
          select
            root
          from
            "libraryRoot"
          where
            "libraryId" = ${library.id}
        `;
      expect(rows).toEqual([{ root: '/delete' }]);
      const rows2 = yield* sql`
          select
            "matchFailureReason",
            "customOrder"
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `;
      expect(rows2).toEqual([{ matchFailureReason: 'unmatched', customOrder: 0 }]);
      yield* client.library.delete({ params: library });
      const rows3 = yield* sql`
          select
            id
          from
            "libraryRoot"
          where
            "libraryId" = ${library.id}
        `;
      expect(rows3).toEqual([]);
      const rows4 = yield* sql`
          select
            id
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `;
      expect(rows4).toEqual([]);
      const rows5 = yield* sql`
          select
            location
          from
            "mediaFile"
          where
            location = '/shared'
        `;
      expect(rows5).toEqual([{ location: '/shared' }]);
      const resultValueError = yield* client.library.get({ params: library }).pipe(Effect.flip);
      expect(resultValueError).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
    })
  );

  iit.effect(
    'paginates admin listings including libraries awaiting setup',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository;
      const marker = yield* client.library.create({ payload: createInput('Page marker') });
      const firstRecord = yield* repository.create(createRecord('Page first'));
      const first = { id: firstRecord.storageKey.library.id };
      yield* repository.create(createRecord('Page second'));
      const page = yield* client.library.list({
        query: { cursor: Option.some(marker.id), limit: 1 },
      });
      expect(
        Array.map(page.items, ({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page first', storagePluginStatus: 'healthy' }]);
      expect(page.nextCursor).toEqual(Option.some(first.id));
      const last = yield* client.library.list({ query: { cursor: page.nextCursor, limit: 10 } });
      expect(
        Array.map(last.items, ({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page second', storagePluginStatus: 'healthy' }]);
      expect(last.nextCursor).toEqual(Option.none());
    })
  );

  iit.effect(
    'rejects unauthenticated requests',
    Effect.fnUntraced(function* () {
      const client = yield* HttpApiTest.groups(Api, ['library']).pipe(
        Effect.provide(
          HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request))
        )
      );
      const createError = yield* client.library
        .create({ payload: createInput('Unauthorized') })
        .pipe(Effect.flip);
      expect(createError).toMatchObject({ _tag: 'UnauthorizedError' });
      const listError = yield* client.library
        .list({ query: { cursor: Option.none(), limit: 1 } })
        .pipe(Effect.flip);
      expect(listError).toMatchObject({ _tag: 'UnauthorizedError' });
    })
  );
  iit.effect.each(['user', 'under18'] as const)(
    'rejects non-admin %s requests',
    Effect.fnUntraced(function* (role) {
      const auth = yield* makeAuthedClient({ username: role, role });
      const client = yield* HttpApiTest.groups(Api, ['library']).pipe(Effect.provide(auth.layer));
      const createError = yield* client.library
        .create({ payload: createInput('Forbidden') })
        .pipe(Effect.flip);
      expect(createError).toMatchObject({ _tag: 'ForbiddenError' });
      const listError = yield* client.library
        .list({ query: { cursor: Option.none(), limit: 1 } })
        .pipe(Effect.flip);
      expect(listError).toMatchObject({ _tag: 'ForbiddenError' });
    })
  );
});

const makeWireTransport = Effect.fnUntraced(function* (
  user: Option.Option<Parameters<typeof makeAuthedClient>[0]>
) {
  const headers = Option.isSome(user)
    ? (yield* makeAuthedClient(user.value)).headers
    : Headers.empty;
  const toHttpEffectResult = yield* HttpRouter.toHttpEffect(Layer.empty);
  const handler = HttpEffect.toWebHandler(toHttpEffectResult);
  const http = HttpClient.make((request, _url, signal) =>
    HttpClientRequest.toWeb(request, { signal }).pipe(
      Effect.flatMap((webRequest) => Effect.promise(async () => handler(webRequest))),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      Effect.orDie
    )
  ).pipe(HttpClient.mapRequest(HttpClientRequest.setHeaders(headers)));
  const client = yield* HttpApiClient.makeWith(Api, {
    httpClient: http,
    baseUrl: 'http://localhost',
  }).pipe(
    Effect.provide(
      HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request))
    )
  );
  return { client, http, handler, headers };
});

it.layer(wireTestLayer)('library HTTP transport', (iit) => {
  iit.effect(
    'serves draft forms and creates settings and roots atomically over HTTP',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_draft', role: 'admin' })
      );
      const input = createInput('Draft HTTP', 'npm:test');
      const draftForm = yield* client.library.getDraftStoragePluginSettingsForm({ payload: input });
      expect(draftForm).toMatchObject([{ label: 'Draft HTTP', initialValue: '' }]);
      for (const payload of [
        { ...input, storagePluginSettings: StoragePluginSettingsInput.make({ root: 123 }) },
        { ...input, roots: [{ root: 'relative' }] },
      ]) {
        const createError = yield* client.library.create({ payload }).pipe(Effect.flip);
        expect(createError).toMatchObject({
          _tag:
            payload.roots.length > 0
              ? 'LibraryInvalidRootError'
              : 'StoragePluginInvalidSettingsError',
        });
        expect(
          Array.some(
            (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items,
            (row) => row.name === input.name
          )
        ).toBe(false);
      }
      const created = yield* client.library.create({
        payload: { ...input, roots: [{ root: '/one' }] },
      });
      const library = yield* client.library.get({ params: created });
      expect(library).toMatchObject({
        storagePluginSettings: { prefix: '/initial' },
        roots: [{ root: '/one' }],
      });
      yield* client.library.delete({ params: created });
    })
  );

  iit.effect(
    'rolls back settings updates when existing roots fail validation',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_update_rollback', role: 'admin' })
      );
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({
        payload: { ...createInput('Update rollback', 'npm:test'), roots: [{ root: '/one' }] },
      });
      const before = yield* client.library.get({ params: library });
      const previous = fixture.controls.beforeRootDecode;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          fixture.controls.beforeRootDecode = previous;
        })
      );
      fixture.controls.beforeRootDecode = (request) =>
        Schema.is(Schema.Struct({ prefix: Schema.Literal('/reject') }))(request.settings)
          ? Effect.fail(
              StorageLocationValidationError.make({ message: 'Rejected by new settings' })
            )
          : Effect.void;
      const setStoragePluginSettingsError = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/reject' }) },
        })
        .pipe(Effect.flip);
      expect(setStoragePluginSettingsError).toMatchObject({ _tag: 'LibraryInvalidRootError' });
      const after = yield* client.library.get({ params: library });
      expect({ settings: after.storagePluginSettings, roots: after.roots }).toEqual({
        settings: before.storagePluginSettings,
        roots: before.roots,
      });
      yield* client.library.delete({ params: library });
    })
  );

  iit.effect.each(['client interruption', 'request abort'] as const)(
    'interrupts and finalizes blocked settings decoding on %s',
    Effect.fnUntraced(
      function* (scenario) {
        const { client, handler, headers } = yield* makeWireTransport(
          Option.some({ username: 'wire_cancellation', role: 'admin' })
        );
        const fixture = yield* PluginFixture;
        const library = yield* Effect.acquireRelease(
          client.library.create({
            payload: createInput(`HTTP ${scenario}`, 'npm:test'),
          }),
          (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
        );
        const started = yield* Latch.make();
        const interrupted = yield* Latch.make();
        const finalized = yield* Latch.make();
        const release = yield* Latch.make();
        const { beforeDecode } = fixture.controls;
        yield* Effect.addFinalizer(() =>
          release.open.pipe(
            Effect.andThen(
              Effect.sync(() => {
                fixture.controls.beforeDecode = beforeDecode;
              })
            )
          )
        );
        fixture.controls.beforeDecode = (request) =>
          request.library.name === `HTTP ${scenario}`
            ? Effect.acquireUseRelease(
                Effect.void,
                () =>
                  started.open.pipe(
                    Effect.andThen(release.await),
                    Effect.onInterrupt(() => interrupted.open.pipe(Effect.asVoid))
                  ),
                () => finalized.open.pipe(Effect.asVoid)
              )
            : Effect.void;
        const payload = { input: StoragePluginSettingsInput.make({ root: '/cancelled' }) };
        // oxlint-disable-next-line effecttsgo/abort-controller-in-effect -- model a caller-owned signal independent of Effect interruption
        const controller = new AbortController();
        const request = yield* (
          scenario === 'client interruption'
            ? client.library.setStoragePluginSettings({ params: library, payload })
            : HttpClientRequest.toWeb(
                HttpClientRequest.put(
                  `http://localhost/api/libraries/${library.id}/plugins/storage/settings`
                ).pipe(
                  HttpClientRequest.setHeaders(headers),
                  HttpClientRequest.bodyJsonUnsafe(payload)
                ),
                { signal: controller.signal }
              ).pipe(
                Effect.flatMap((webRequest) => Effect.promise(async () => handler(webRequest)))
              )
        ).pipe(Effect.forkChild);
        yield* started.await;
        expect(interrupted.isOpen()).toBe(false);
        expect(finalized.isOpen()).toBe(false);
        if (scenario === 'request abort') {
          controller.abort();
        } else {
          yield* Fiber.interrupt(request);
          expect(controller.signal.aborted).toBe(false);
        }
        yield* interrupted.await;
        yield* finalized.await;
        expect(release.isOpen()).toBe(false);
        expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
          prefix: '/initial',
        });
      },
      (effect) => TestClock.withLive(effect.pipe(Effect.timeout('3 seconds')))
    )
  );

  iit.effect.each([
    [
      'invalid submission',
      'PUT',
      422,
      'StoragePluginInvalidSettingsError',
      'Submitted storage plugin settings failed validation',
    ],
    ['operational GET', 'GET', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
    ['operational PUT', 'PUT', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
    [
      'invalid current settings',
      'GET',
      500,
      'StoragePluginSettingsError',
      'Storage plugin could not build the settings form from the current settings',
    ],
  ] as const)(
    'distinguishes submitted settings validation from operational failures: %s',
    Effect.fnUntraced(function* ([scenario, method, status, tag, message]) {
      const { client, http } = yield* makeWireTransport(
        Option.some({ username: 'wire_settings', role: 'admin' })
      );
      const fixture = yield* PluginFixture;
      const repository = yield* LibraryRepository.make;
      const library = yield* Effect.acquireRelease(
        client.library.create({
          payload: createInput(`HTTP settings ${scenario}`, 'npm:test'),
        }),
        (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
      );
      const original = StoragePluginSettingsPersisted.make(
        scenario === 'invalid current settings' ? {} : { prefix: '/original' }
      );
      yield* repository.update({
        ...createRecord(`HTTP settings ${scenario}`, 'npm:test'),
        ...library,
        storagePluginSettings: original,
      });
      const { settingsError } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          fixture.controls.settingsError = settingsError;
        })
      );
      fixture.controls.settingsError =
        scenario === 'operational GET' || scenario === 'operational PUT';
      const input = StoragePluginSettingsInput.make({
        root:
          scenario === 'invalid submission' ? { secret: 'submitted-settings-secret' } : '/updated',
      });
      const path = `http://localhost/api/libraries/${library.id}/plugins/storage`;
      const response = yield* http.execute(
        method === 'GET'
          ? HttpClientRequest.get(`${path}/settings-form`)
          : HttpClientRequest.put(`${path}/settings`).pipe(
              HttpClientRequest.bodyJsonUnsafe({ input })
            )
      );
      expect(response.status).toBe(status);
      const body = yield* response.text;
      const decodedLocation = yield* pipe(
        body,
        Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))
      );
      expect(decodedLocation).toEqual({
        _tag: tag,
        message,
      });
      expect(body).not.toContain('submitted-settings-secret');
      const error = yield* method === 'GET'
        ? client.library.getStoragePluginSettingsForm({ params: library }).pipe(Effect.flip)
        : client.library
            .setStoragePluginSettings({ params: library, payload: { input } })
            .pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: tag, message });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        original
      );
    })
  );

  iit.effect.each(['malformed form output', 'malformed persisted output'] as const)(
    'returns a bodyless 500 without changing persisted settings for %s',
    Effect.fnUntraced(function* (scenario) {
      const { client, http } = yield* makeWireTransport(
        Option.some({ username: 'wire_malformed_settings', role: 'admin' })
      );
      const fixture = yield* PluginFixture;
      const repository = yield* LibraryRepository.make;
      const library = yield* Effect.acquireRelease(
        client.library.create({
          payload: createInput(`HTTP settings ${scenario}`, 'npm:test'),
        }),
        (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
      );
      const original = StoragePluginSettingsPersisted.make({ prefix: '/original' });
      yield* repository.update({
        ...createRecord(`HTTP settings ${scenario}`, 'npm:test'),
        ...library,
        storagePluginSettings: original,
      });
      const { invalidForm, invalidPersisted } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Object.assign(fixture.controls, { invalidForm, invalidPersisted });
        })
      );
      fixture.controls.invalidForm = scenario === 'malformed form output';
      fixture.controls.invalidPersisted = scenario === 'malformed persisted output';
      const path = `http://localhost/api/libraries/${library.id}/plugins/storage`;
      const response = yield* http.execute(
        scenario === 'malformed form output'
          ? HttpClientRequest.get(`${path}/settings-form`)
          : HttpClientRequest.put(`${path}/settings`).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                input: StoragePluginSettingsInput.make({ root: 'submitted-settings-secret' }),
              })
            )
      );
      expect(response.status).toBe(500);
      const text = yield* response.text;
      expect(text).toBe('');
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        original
      );
    })
  );

  iit.effect(
    'encodes settings JSON and returns bodyless, idempotent deletion',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_admin', role: 'admin' })
      );
      const library = yield* client.library.create({ payload: createInput('HTTP library') });
      const get = yield* client.library.get({ params: library, responseMode: 'response-only' });
      expect(get.headers['content-type']).toContain('application/json');
      const json = yield* get.json;
      expect(json).toMatchObject({
        ...library,
        storagePluginSettings: {},
        storagePluginHealth: { status: 'healthy' },
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({}) },
      });
      const list = yield* client.library.list({
        query: { cursor: Option.none(), limit: 1 },
        responseMode: 'response-only',
      });
      const json2 = yield* list.json;
      expect(json2).toMatchObject({
        items: [{ ...library, storagePluginSettings: {} }],
        nextCursor: { _tag: 'None' },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const deleted = yield* client.library.delete({
          params: library,
          responseMode: 'response-only',
        });
        expect(deleted.status).toBe(204);
        const text = yield* deleted.text;
        expect(text).toBe('');
      }
      const missing = yield* client.library.get({ params: library }).pipe(Effect.flip);
      expect(missing).toMatchObject({ _tag: 'LibraryNotFoundError', ...library });
    })
  );

  iit.effect(
    'validates path and query values before handlers run',
    Effect.fnUntraced(function* () {
      const { http } = yield* makeWireTransport(
        Option.some({ username: 'wire_validation', role: 'admin' })
      );
      for (const path of [
        '/api/libraries/not-an-id',
        '/api/libraries/-1',
        '/api/libraries',
        '/api/libraries?limit=0',
        '/api/libraries?limit=101',
        '/api/libraries?limit=1.5',
        '/api/libraries?limit=1&cursor=invalid',
      ]) {
        const response = yield* http.get(`http://localhost${path}`);
        expect(response.status, path).toBe(400);
      }
    })
  );

  iit.effect.each([
    [Option.none(), 401, 'UnauthorizedError'],
    [Option.some({ username: 'wire_user', role: 'user' } as const), 403, 'ForbiddenError'],
  ] as const)(
    'enforces HTTP authentication and admin access (%s)',
    Effect.fnUntraced(function* ([user, status, tag]) {
      const { http } = yield* makeWireTransport(user);
      const response = yield* http.get('http://localhost/api/libraries?limit=1');
      expect(response.status).toBe(status);
      const json = yield* response.json;
      expect(json).toEqual({ _tag: tag });
    })
  );
});
