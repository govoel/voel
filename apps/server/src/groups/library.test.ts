/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem, BunHttpServer, BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginSettings,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Deferred, Effect, Fiber, Layer, Option, Schema } from 'effect';
import { FetchHttpClient, Headers, HttpEffect, HttpRouter } from 'effect/http';
import { HttpApiClient, HttpApiMiddleware, HttpApiTest } from 'effect/http-api';
import { Reactivity } from 'effect/reactivity';
import { TestClock } from 'effect/testing';

import { TursoClient } from '@repo/effect-turso';
import { Api } from '@repo/spec-api';
import { Library } from '@repo/spec-api/database/schema.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';
import { PluginLoadError } from '@repo/spec-api/plugins/index.ts';

import { ApiRoutesLayerNoDeps } from '#src/groups/index.ts';
import { LibraryHandlersLayerNoDeps, LibraryRepository } from '#src/groups/library.ts';
import { makeAuthedClient, makeRawRequest } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { PluginModuleMap } from '#src/services/plugins/index.ts';
import {
  StoragePluginBuilder,
  StoragePluginMap,
  StoragePluginModuleMap,
  StoragePluginSettingsMap,
} from '#src/services/plugins/storage/index.ts';

class Input extends Schema.Struct({ root: Schema.NonEmptyString }) {}
class Persisted extends Schema.Struct({ prefix: Schema.NonEmptyString }) {}

class PluginFixture extends Context.Service<PluginFixture>()(
  '@repo/server/groups/library.test/PluginFixture',
  {
    make: Effect.sync(() => {
      const activeStorage = new Set<Parameters<StoragePluginModule['storage']['layer']>[0]>();
      const controls = {
        beforeRootDecode: (
          _request: Parameters<StoragePluginModule['storage']['layer']>[0] & {
            readonly location: string;
          }
        ): Effect.Effect<void> => Effect.void,
        onFinalize: (
          _request: Parameters<StoragePluginModule['storage']['layer']>[0]
        ): Effect.Effect<void> => Effect.void,
        beforeDecode: (
          _request: Parameters<StoragePluginModule['storage']['layerSettings']>[0] & {
            readonly input: StoragePluginSettingsInput;
          }
        ): Effect.Effect<void> => Effect.void,
        invalidForm: false,
        invalidPersisted: false,
        settingsError: false,
      };
      const module = {
        storage: {
          layer: (request) =>
            Layer.effect(
              StoragePlugin,
              Effect.gen(function* () {
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    activeStorage.delete(request);
                  }).pipe(Effect.andThen(controls.onFinalize(request)))
                );
                const settings = yield* Schema.decodeUnknownEffect(Persisted)(
                  request.settings
                ).pipe(
                  Effect.catchTag('SchemaError', () =>
                    StoragePluginConstructionError.make({ message: 'Invalid persisted settings' })
                  )
                );
                if (settings.prefix === 'unavailable' || request.library.name === 'Rejected') {
                  return yield* StoragePluginConstructionError.make({
                    message: 'Storage unavailable',
                  });
                }
                activeStorage.add(request);
                const decodeRoot = Schema.decodeEffect(
                  StorageRootLocation.check(Schema.isStartingWith('/'))
                );
                return StoragePlugin.of({
                  decodeRootLocation: ({ location }) =>
                    controls.beforeRootDecode({ ...request, location }).pipe(
                      Effect.andThen(decodeRoot(location.trim())),
                      Effect.catchTag('SchemaError', (error) =>
                        StorageLocationValidationError.make({ message: error.message })
                      )
                    ),
                  decodeMediaFileLocation: ({ location }) =>
                    Effect.succeed(StorageMediaFileLocation.make(location)),
                });
              })
            ),
          layerSettings: (request) =>
            Layer.effect(
              StoragePluginSettings,
              Effect.sync(() =>
                StoragePluginSettings.of({
                  getForm: ({ current }) =>
                    Effect.gen(function* () {
                      if (controls.settingsError) {
                        return yield* StoragePluginSettingsError.make({
                          message: 'Settings unavailable',
                        });
                      }
                      const settings = Option.isSome(current)
                        ? yield* Schema.decodeUnknownEffect(Persisted)(current.value)
                        : { prefix: '' };
                      const field = {
                        _tag: 'TextField' as const,
                        name: StoragePluginSettingsForm.value.fields.name.make('root'),
                        label: request.library.name,
                        placeholder: '',
                        initialValue: settings.prefix,
                      };
                      // A malformed descriptor returned by an otherwise valid module must be host-rejected.
                      return controls.invalidForm ? [field, field] : [field];
                    }),
                  decodeFormSubmission: ({ input }) =>
                    controls.beforeDecode({ ...request, input }).pipe(
                      Effect.andThen(() =>
                        controls.settingsError
                          ? StoragePluginSettingsError.make({ message: 'Settings unavailable' })
                          : Effect.void
                      ),
                      Effect.andThen(Schema.decodeUnknownEffect(Input)(input)),
                      Effect.map(({ root }) => {
                        // Model a plugin returning JSON invalidated after branding.
                        if (controls.invalidPersisted) {
                          const value = { prefix: root.trim(), version: 1 };
                          const settings = StoragePluginSettingsPersisted.make(value);
                          value.version = Number.NaN;
                          return settings;
                        }
                        return StoragePluginSettingsPersisted.make({ prefix: root.trim() });
                      })
                    ),
                })
              )
            ),
        },
      } satisfies StoragePluginModule;
      return { module, activeStorage, controls };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}

const pluginLayer = Layer.mergeAll(
  StoragePluginMap.layerNoDeps,
  StoragePluginSettingsMap.layerNoDeps
).pipe(
  Layer.provideMerge(StoragePluginBuilder.layerNoDeps),
  Layer.provideMerge(StoragePluginModuleMap.layerNoDeps),
  Layer.provideMerge(
    Layer.effect(
      PluginModuleMap,
      Effect.gen(function* () {
        const fixture = yield* PluginFixture;
        return {
          get: (plugin) =>
            plugin === Library.fields.storagePlugin.make('npm:missing')
              ? Effect.fail(PluginLoadError.make({ message: 'Plugin unavailable' }))
              : Effect.succeed({ default: fixture.module }),
        };
      })
    )
  ),
  Layer.provideMerge(PluginFixture.layer),
  Layer.provide([BunFileSystem.layer, BunPath.layer, FetchHttpClient.layer])
);

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

class TestClient extends Context.Service<TestClient>()(
  '@repo/server/groups/library.test/TestClient',
  { make: HttpApiTest.groups(Api, ['library']) }
) {}

// Handlers capture the fixture's maps while the test client's routes are built.
const testClientLayer = Layer.effect(TestClient, TestClient.make).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);
const makeTestClient = ({
  authLayer,
}: {
  readonly authLayer: Effect.Success<ReturnType<typeof makeAuthedClient>>['layer'];
}) =>
  // Keep the handlers' retirement scope alive until the enclosing test scope closes.
  Layer.build(testClientLayer.pipe(Layer.provide(authLayer))).pipe(
    Effect.map(Context.get(TestClient))
  );
const wireTestLayer = ApiRoutesLayerNoDeps.pipe(
  Layer.provideMerge(testDependenciesLayer),
  Layer.provideMerge(HttpRouter.layer)
);

const createInput = (
  name: string,
  plugin: 'builtin:local' | `npm:${string}` = 'builtin:local'
) => ({
  name: Library.fields.name.make(name),
  type: Library.fields.type.make('movie'),
  storagePlugin: Library.fields.storagePlugin.make(plugin),
});
const makeClient = Effect.gen(function* () {
  const auth = yield* makeAuthedClient({ username: 'libraryadmin', role: 'admin' });
  return yield* makeTestClient({ authLayer: auth.layer });
});

it.layer(testDependenciesLayer)('library lifecycle', (iit) => {
  iit.effect(
    'collects cached failures from both plugin components',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository.make;
      const library = yield* client.library.create({
        payload: createInput('Failed health', 'npm:missing'),
      });
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({}),
      });
      expect(
        yield* client.library.getStoragePluginSettingsForm({ params: library }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect(
        yield* client.library
          .setRoots({ params: library, payload: { roots: [] } })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
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
    'reads only cached plugin health, reports failures, and forgets retired instances',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const library = yield* client.library.create({ payload: createInput('Health', 'npm:test') });
      const listItem = Effect.gen(function* () {
        return (yield* client.library.list({
          query: { cursor: Option.none(), limit: 100 },
        })).items.find(({ id }) => id === library.id);
      });
      for (let index = 0; index < 2; index += 1) {
        expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
          status: 'unknown',
        });
        expect(yield* listItem).toMatchObject({ storagePluginStatus: 'unknown' });
      }

      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: 'unavailable' }) },
      });
      // Persisted settings alone do not imply that storage is healthy.
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'healthy' });

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
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* client.library.setRoots({ params: library, payload: { roots: [] } });
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'healthy' });

      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('New health') },
      });
      expect((yield* client.library.get({ params: library })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'unknown' });
    })
  );

  iit.effect(
    'excludes cached health for obsolete settings and library context',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository.make;
      const library = yield* client.library.create({
        payload: createInput('Stale health', 'npm:test'),
      });
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: 'unavailable' }),
      });
      yield* client.library.setRoots({ params: library, payload: { roots: [] } }).pipe(Effect.flip);
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'unhealthy'
      );

      // Leave old entries cached, as can happen while retirement is still in progress.
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: '/current' }),
      });
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'unknown'
      );
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'healthy'
      );
      yield* repository.rename({
        ...library,
        name: Library.fields.name.make('New health context'),
      });
      expect((yield* client.library.get({ params: library })).storagePluginHealth.status).toBe(
        'unknown'
      );
      expect(
        (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items.find(
          ({ id }) => id === library.id
        )
      ).toMatchObject({ storagePluginStatus: 'unknown' });
    })
  );

  iit.effect(
    'rolls back root removal when standalone replacement fails to insert',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository.make;
      const sql = yield* LibraryDatabase;
      const library = yield* repository.create(createInput('Atomic roots'));
      yield* repository.setRoots({
        ...library,
        roots: [StorageRootLocation.make('/original')],
      });
      yield* Effect.acquireRelease(
        sql`
          create trigger "rejectRootReplacement" before insert on "libraryRoot" when new.root = '/rejected-root-replacement' begin
          select
            raise (abort, 'Root insertion rejected');

          end;
        `,
        () =>
          sql`
            drop trigger "rejectRootReplacement"
          `.pipe(Effect.orDie)
      );

      expect(
        yield* repository
          .setRoots({ ...library, roots: [StorageRootLocation.make('/rejected-root-replacement')] })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError' });
      expect((yield* repository.getById(library)).roots.map(({ root }) => root)).toEqual([
        '/original',
      ]);
    })
  );

  iit.effect(
    'creates unconfigured libraries and explicitly configures local storage',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const sql = yield* LibraryDatabase;
      const library = yield* client.library.create({ payload: createInput('Local') });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.none()
      );
      expect(
        yield* sql`
          select
            "storagePluginSettings"
          from
            library
          where
            id = ${library.id}
        `
      ).toEqual([{ storagePluginSettings: null }]);
      expect(
        (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items.some(
          ({ id }) => id === library.id
        )
      ).toBe(true);
      expect(
        yield* client.library
          .setRoots({ params: library, payload: { roots: [] } })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryUnconfiguredError' });
      expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toEqual([]);
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({}) },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some({})
      );
      expect(
        yield* sql`
          select
            "storagePluginSettings"
          from
            library
          where
            id = ${library.id}
        `
      ).toEqual([{ storagePluginSettings: '{}' }]);
      expect(
        yield* client.library
          .setRoots({ params: library, payload: { roots: [{ root: 'relative' }] } })
          .pipe(Effect.flip)
      ).toMatchObject({
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
      expect(
        yield* client.library
          .setRoots({
            params: library,
            payload: { roots: [{ root: 'relative' }, { root: '/valid' }, { root: '/nul\0' }] },
          })
          .pipe(Effect.flip)
      ).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [
          { root: 'relative', message: 'Library root locations must be absolute paths' },
          { root: '/nul\0', message: 'Library root locations must not contain NUL characters' },
        ],
      });
      expect(
        (yield* client.library.get({ params: library })).roots.map(({ root }) => root)
      ).toEqual(['/original']);
    })
  );

  iit.effect(
    'defers plugin loading and rejects name conflicts without resurrecting rows',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const missing = yield* client.library.create({
        payload: createInput('Missing plugin', 'npm:missing'),
      });
      expect(yield* client.library.get({ params: missing })).toMatchObject({
        storagePlugin: 'npm:missing',
        storagePluginSettings: Option.none(),
        storagePluginHealth: { status: 'unknown' },
      });
      expect(
        yield* client.library.getStoragePluginSettingsForm({ params: missing }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* client.library.get({ params: missing })).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [{ _tag: 'PluginLoadError', message: 'Plugin unavailable' }],
      });
      expect(
        (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items.find(
          ({ id }) => id === missing.id
        )
      ).toMatchObject({ storagePluginStatus: 'unhealthy' });
      const original = yield* client.library.create({ payload: createInput('Unique') });
      expect(
        yield* client.library.create({ payload: createInput('Unique') }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNameConflictError' });
      const other = yield* client.library.create({ payload: createInput('Other') });
      expect(
        yield* client.library
          .update({ params: other, payload: { name: Library.fields.name.make('Unique') } })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNameConflictError' });
      expect((yield* client.library.get({ params: other })).name).toBe('Other');
      yield* client.library.delete({ params: original });
      yield* client.library.delete({ params: original });
      expect(
        yield* client.library
          .update({ params: original, payload: { name: Library.fields.name.make('Gone') } })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNotFoundError' });
      const recreated = yield* client.library.create({ payload: createInput('Unique') });
      expect(recreated.id).not.toBe(original.id);
    })
  );

  iit.effect(
    'round-trips transformed settings, retries setup with stable identity, and isolates libraries',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({ payload: createInput('Remote', 'npm:test') });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toEqual([
          { _tag: 'TextField', name: 'root', label: 'Remote', placeholder: '', initialValue: '' },
        ]);
      }
      const failure = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: 123 }) },
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: 'LibraryInvalidStoragePluginSettingsError',
        message: 'Submitted storage plugin settings failed validation',
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.none()
      );
      yield* client.library.getStoragePluginSettingsForm({ params: library });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: 'unavailable' }) },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some({ prefix: 'unavailable' })
      );
      expect(
        yield* client.library
          .setRoots({ params: library, payload: { roots: [] } })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toMatchObject(
        [{ initialValue: 'unavailable', label: 'Remote' }]
      );
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: ' /remote ' }) },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/remote' })
      );
      expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toMatchObject(
        [{ initialValue: '/remote', label: 'Remote' }]
      );
      yield* client.library.setRoots({
        params: library,
        payload: { roots: [{ root: ' /one ' }, { root: '/one' }] },
      });
      expect(
        (yield* client.library.get({ params: library })).roots.map(({ root }) => root)
      ).toEqual(['/one']);
      yield* client.library.setRoots({ params: library, payload: { roots: [{ root: '/one' }] } });
      expect(
        (yield* client.library.get({ params: library })).roots.map(({ root }) => root)
      ).toEqual(['/one']);
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Rejected') },
      });
      expect((yield* client.library.get({ params: library })).name).toBe('Rejected');
      expect(
        yield* client.library
          .setRoots({ params: library, payload: { roots: [] } })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Renamed') },
      });
      expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toMatchObject(
        [{ label: 'Renamed', initialValue: '/remote' }]
      );
      const second = yield* client.library.create({
        payload: createInput('Second remote', 'npm:test'),
      });
      expect(yield* client.library.getStoragePluginSettingsForm({ params: second })).toEqual([
        {
          _tag: 'TextField',
          name: 'root',
          label: 'Second remote',
          placeholder: '',
          initialValue: '',
        },
      ]);
      fixture.controls.invalidForm = true;
      expect(
        yield* client.library.getStoragePluginSettingsForm({ params: second }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginSettingsError' });
      fixture.controls.invalidForm = false;
      yield* client.library.setRoots({ params: library, payload: { roots: [] } });
      expect((yield* client.library.get({ params: library })).roots).toEqual([]);
    })
  );

  iit.effect(
    'returns before idle plugin cleanup finishes and retires beyond the request scope',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.library.create({
        payload: createInput('Background retirement', 'npm:test'),
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/background' }) },
      });
      yield* client.library.setRoots({ params: library, payload: { roots: [{ root: '/one' }] } });

      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      const finished = yield* Deferred.make<boolean>();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(Deferred.succeed(finished, true)),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(release, true).pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.onFinalize = () => Effect.void;
            })
          )
        )
      );

      // Closing this caller scope must not interrupt or await retirement.
      const response = yield* Effect.scoped(
        client.library.update({
          params: library,
          payload: { name: Library.fields.name.make('Background renamed') },
        })
      );
      expect(response).toEqual(library);
      yield* Deferred.await(started);
      expect(yield* Deferred.isDone(finished)).toBe(false);
      expect((yield* client.library.get({ params: library })).name).toBe('Background renamed');
      expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toMatchObject(
        [{ label: 'Background renamed', initialValue: '/background' }]
      );
      expect(
        (yield* client.library.get({ params: library })).roots.map(({ root }) => root)
      ).toEqual(['/one']);
      yield* Deferred.succeed(release, true);
      yield* Deferred.await(finished);
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
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeRootDecode = (request) =>
        request.library.id === library.id && request.location === '/pending'
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(release, true).pipe(
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
      yield* Deferred.await(started);
      // A separate connection proves the write lock prevents context changes during decoding.
      expect(
        yield* contender`
          update library
          set
            name = 'Renamed root context'
          where
            id = ${library.id}
        `.pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      expect(
        yield* contender`
          update library
          set
            "storagePluginSettings" = '{"prefix":"/updated"}'
          where
            id = ${library.id}
        `.pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      expect(yield* client.library.get({ params: library })).toMatchObject({
        name: 'Locked root context',
        storagePluginSettings: Option.some({ prefix: '/initial' }),
        roots: [{ root: '/original' }],
      });
      yield* Deferred.succeed(release, true);
      expect(yield* Fiber.join(pending)).toEqual({ ...library, roots: [{ root: '/pending' }] });
      expect(
        (yield* client.library.get({ params: library })).roots.map(({ root }) => root)
      ).toEqual(['/pending']);
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Renamed root context') },
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/updated' }) },
      });
      expect(yield* client.library.get({ params: library })).toMatchObject({
        name: 'Renamed root context',
        storagePluginSettings: Option.some({ prefix: '/updated' }),
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
      const settingsStarted = yield* Deferred.make<boolean>();
      const settingsRelease = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id &&
        Schema.is(Input)(request.input) &&
        request.input.root === '/pending-settings'
          ? Deferred.succeed(settingsStarted, true).pipe(
              Effect.andThen(Deferred.await(settingsRelease))
            )
          : Effect.void;
      const settings = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/pending-settings' }) },
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(settingsStarted);
      // Renaming while decoding is blocked must not overwrite settings or hold a write lock.
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Final name') },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/initial' })
      );
      yield* Deferred.succeed(settingsRelease, true);
      yield* Fiber.join(settings);
      expect(yield* client.library.get({ params: library })).toMatchObject({
        name: 'Final name',
        storagePluginSettings: Option.some({ prefix: '/pending-settings' }),
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
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id &&
        Schema.is(Input)(request.input) &&
        request.input.root === '/slow'
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      const slow = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/slow' }) },
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({ root: '/fast' }) },
      });
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(slow);
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/slow' })
      );
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
        [...fixture.activeStorage]
          .filter(({ library: row }) => row.id === library.id)
          .map(({ settings }) => settings)
      ).toEqual([{ prefix: '/initial' }]);
      const retired = yield* Deferred.make<boolean>();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(retired, true).pipe(Effect.asVoid)
          : Effect.void;
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      const pending = yield* client.library
        .setStoragePluginSettings({
          params: library,
          payload: { input: StoragePluginSettingsInput.make({ root: '/deleted' }) },
        })
        .pipe(Effect.flip, Effect.forkChild);
      yield* Deferred.await(started);
      yield* client.library.delete({ params: library });
      yield* Deferred.await(retired);
      expect(
        [...fixture.activeStorage].filter(({ library: row }) => row.id === library.id)
      ).toEqual([]);
      yield* Deferred.succeed(release, true);
      expect(yield* Fiber.join(pending)).toMatchObject({ _tag: 'LibraryNotFoundError' });
      expect(yield* client.library.get({ params: library }).pipe(Effect.flip)).toMatchObject({
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
      expect(
        yield* sql`
          select
            root
          from
            "libraryRoot"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([{ root: '/delete' }]);
      expect(
        yield* sql`
          select
            "matchFailureReason",
            "customOrder"
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([{ matchFailureReason: 'unmatched', customOrder: 0 }]);
      yield* client.library.delete({ params: library });
      expect(
        yield* sql`
          select
            id
          from
            "libraryRoot"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([]);
      expect(
        yield* sql`
          select
            id
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([]);
      expect(
        yield* sql`
          select
            location
          from
            "mediaFile"
          where
            location = '/shared'
        `
      ).toEqual([{ location: '/shared' }]);
      expect(yield* client.library.get({ params: library }).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
    })
  );

  iit.effect(
    'paginates admin listings including libraries awaiting setup',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const marker = yield* client.library.create({ payload: createInput('Page marker') });
      const first = yield* client.library.create({ payload: createInput('Page first') });
      yield* client.library.create({ payload: createInput('Page second') });
      const page = yield* client.library.list({
        query: { cursor: Option.some(marker.id), limit: 1 },
      });
      expect(
        page.items.map(({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page first', storagePluginStatus: 'unknown' }]);
      expect(page.nextCursor).toEqual(Option.some(first.id));
      const last = yield* client.library.list({ query: { cursor: page.nextCursor, limit: 10 } });
      expect(
        last.items.map(({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page second', storagePluginStatus: 'unknown' }]);
      expect(last.nextCursor).toEqual(Option.none());
    })
  );

  iit.effect(
    'rejects unauthenticated requests',
    Effect.fnUntraced(function* () {
      const client = yield* makeTestClient({
        authLayer: HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
          next(request)
        ),
      });
      expect(
        yield* client.library.create({ payload: createInput('Unauthorized') }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'UnauthorizedError' });
      expect(
        yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'UnauthorizedError' });
    })
  );
  iit.effect.each(['user', 'under18'] as const)(
    'rejects non-admin %s requests',
    Effect.fnUntraced(function* (role) {
      const auth = yield* makeAuthedClient({ username: role, role });
      const client = yield* makeTestClient({ authLayer: auth.layer });
      expect(
        yield* client.library.create({ payload: createInput('Forbidden') }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
      expect(
        yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
    })
  );
});

// The Fetch override is local to this client; plugin HTTP traffic keeps its real transport.
const makeWireTransport = Effect.fnUntraced(function* (
  user: Option.Option<Parameters<typeof makeAuthedClient>[0]>
) {
  const auth = Option.isSome(user)
    ? yield* makeAuthedClient(user.value)
    : {
        headers: Headers.empty,
        layer: HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request)),
      };
  const handler = HttpEffect.toWebHandler(yield* HttpRouter.toHttpEffect(Layer.empty));
  const localFetch: typeof fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      handler(
        input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
      ),
    {
      preconnect() {
        // In-memory requests do not open connections.
      },
    }
  );
  const client = yield* HttpApiClient.make(Api, { baseUrl: 'http://localhost' }).pipe(
    Effect.provide([
      auth.layer,
      Layer.fresh(FetchHttpClient.layer).pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, localFetch))
      ),
    ])
  );
  return { client, send: makeRawRequest({ handler, headers: auth.headers }) };
});

it.layer(wireTestLayer)('library HTTP transport', (iit) => {
  iit.effect.each(['typed interruption', 'raw interruption', 'raw explicit abort'] as const)(
    'interrupts and finalizes blocked settings decoding on %s',
    Effect.fnUntraced(
      function* (scenario) {
        const { client, send } = yield* makeWireTransport(
          Option.some({ username: 'wire_cancellation', role: 'admin' })
        );
        const fixture = yield* PluginFixture;
        const library = yield* Effect.acquireRelease(
          client.library.create({
            payload: createInput(`HTTP ${scenario}`, 'npm:test'),
          }),
          (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
        );
        const started = yield* Deferred.make<boolean>();
        const interrupted = yield* Deferred.make<boolean>();
        const finalized = yield* Deferred.make<boolean>();
        const release = yield* Deferred.make<boolean>();
        const { beforeDecode } = fixture.controls;
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(release, true).pipe(
            Effect.andThen(
              Effect.sync(() => {
                fixture.controls.beforeDecode = beforeDecode;
              })
            )
          )
        );
        fixture.controls.beforeDecode = (request) =>
          request.library.id === library.id
            ? Effect.acquireUseRelease(
                Effect.void,
                () =>
                  Deferred.succeed(started, true).pipe(
                    Effect.andThen(Deferred.await(release)),
                    Effect.onInterrupt(() =>
                      Deferred.succeed(interrupted, true).pipe(Effect.asVoid)
                    )
                  ),
                () => Deferred.succeed(finalized, true).pipe(Effect.asVoid)
              )
            : Effect.void;
        const payload = { input: StoragePluginSettingsInput.make({ root: '/cancelled' }) };
        // oxlint-disable-next-line effecttsgo/abort-controller-in-effect -- model a caller-owned signal independent of Effect interruption
        const controller = new AbortController();
        const request = yield* (
          scenario === 'typed interruption'
            ? client.library.setStoragePluginSettings({ params: library, payload })
            : send({
                path: `/api/libraries/${library.id}/plugins/storage/settings`,
                method: 'PUT',
                body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(payload),
                // Raw interruption must still work when the caller also supplies a signal.
                signal: controller.signal,
              })
        ).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        expect(yield* Deferred.isDone(interrupted)).toBe(false);
        expect(yield* Deferred.isDone(finalized)).toBe(false);
        if (scenario === 'raw explicit abort') {
          controller.abort();
        } else {
          yield* Fiber.interrupt(request);
          expect(controller.signal.aborted).toBe(false);
        }
        yield* Deferred.await(interrupted);
        yield* Deferred.await(finalized);
        expect(yield* Deferred.isDone(release)).toBe(false);
        expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
          Option.none()
        );
      },
      // A live deadline makes a missing abort fail instead of waiting on the test clock.
      (effect) => TestClock.withLive(effect.pipe(Effect.timeout('3 seconds')))
    )
  );

  iit.effect.each([
    [
      'invalid submission',
      'PUT',
      422,
      'LibraryInvalidStoragePluginSettingsError',
      'Submitted storage plugin settings failed validation',
    ],
    ['operational GET', 'GET', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
    ['operational PUT', 'PUT', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
    [
      'malformed form',
      'GET',
      500,
      'StoragePluginSettingsError',
      'Storage plugin returned an invalid settings form',
    ],
    [
      'malformed persisted output',
      'PUT',
      500,
      'StoragePluginSettingsError',
      'Storage plugin returned invalid persisted settings',
    ],
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
      const { client, send } = yield* makeWireTransport(
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
      yield* repository.setSettings({ ...library, settings: original });
      const { invalidForm, invalidPersisted, settingsError } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Object.assign(fixture.controls, { invalidForm, invalidPersisted, settingsError });
        })
      );
      fixture.controls.invalidForm = scenario === 'malformed form';
      fixture.controls.invalidPersisted = scenario === 'malformed persisted output';
      fixture.controls.settingsError =
        scenario === 'operational GET' || scenario === 'operational PUT';
      const input = StoragePluginSettingsInput.make({
        root:
          scenario === 'invalid submission' ? { secret: 'submitted-settings-secret' } : '/updated',
      });
      const path = `/api/libraries/${library.id}/plugins/storage`;
      const response = yield* send(
        method === 'GET'
          ? { path: `${path}/settings-form`, method }
          : {
              path: `${path}/settings`,
              method,
              body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ input }),
            }
      );
      expect(response.status).toBe(status);
      const body = yield* Effect.promise(async () => response.text());
      expect(yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(body)).toEqual({
        _tag: tag,
        message,
      });
      expect(body).not.toContain('submitted-settings-secret');
      // Also prove the API schema decodes the wire error into the declared client error.
      const error = yield* method === 'GET'
        ? client.library.getStoragePluginSettingsForm({ params: library }).pipe(Effect.flip)
        : client.library
            .setStoragePluginSettings({ params: library, payload: { input } })
            .pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: tag, message });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some(original)
      );
    })
  );

  iit.effect(
    'serves resource methods, tagged errors, Option JSON, and bodyless deletion',
    Effect.fnUntraced(function* () {
      const { client, send } = yield* makeWireTransport(
        Option.some({ username: 'wire_admin', role: 'admin' })
      );
      const payload = createInput('HTTP library');
      const created = yield* send({
        path: '/api/libraries',
        method: 'POST',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(payload),
      });
      expect(created.status).toBe(200);
      const library = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ id: Library.json.fields.id })
      )(yield* Effect.promise(async () => created.json()));
      const path = `/api/libraries/${library.id}`;
      const get = yield* send({ path, method: 'GET' });
      expect(get.status).toBe(200);
      expect(get.headers.get('content-type')).toContain('application/json');
      expect(yield* Effect.promise(async () => get.json())).toMatchObject({
        ...library,
        storagePluginSettings: { _tag: 'None' },
        storagePluginHealth: { status: 'unknown' },
      });
      const conflict = yield* send({
        path: '/api/libraries',
        method: 'POST',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(payload),
      });
      expect(conflict.status).toBe(409);
      expect(yield* Effect.promise(async () => conflict.json())).toMatchObject({
        _tag: 'LibraryNameConflictError',
      });
      expect(
        (yield* send({
          path,
          method: 'PATCH',
          body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            name: 'HTTP renamed',
          }),
        })).status
      ).toBe(200);
      const form = yield* send({ path: `${path}/plugins/storage/settings-form`, method: 'GET' });
      expect(form.status).toBe(200);
      expect(yield* Effect.promise(async () => form.json())).toEqual([]);
      const unconfigured = yield* send({
        path: `${path}/roots`,
        method: 'PUT',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ roots: [] }),
      });
      expect(unconfigured.status).toBe(409);
      expect(yield* Effect.promise(async () => unconfigured.json())).toMatchObject({
        _tag: 'LibraryUnconfiguredError',
      });
      expect(
        (yield* send({
          path: `${path}/plugins/storage/settings`,
          method: 'PUT',
          body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ input: {} }),
        })).status
      ).toBe(200);
      const invalidRoot = yield* send({
        path: `${path}/roots`,
        method: 'PUT',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          roots: [{ root: 'relative' }],
        }),
      });
      expect(invalidRoot.status).toBe(422);
      expect(yield* Effect.promise(async () => invalidRoot.json())).toMatchObject({
        _tag: 'LibraryInvalidRootError',
      });
      const roots = yield* send({
        path: `${path}/roots`,
        method: 'PUT',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          roots: [{ root: '/wire' }],
        }),
      });
      expect(roots.status).toBe(200);
      expect(yield* Effect.promise(async () => roots.json())).toEqual({
        ...library,
        roots: [{ root: '/wire' }],
      });
      const trailing = yield* client.library.create({ payload: createInput('HTTP trailing') });
      const list = yield* send({ path: '/api/libraries?limit=1', method: 'GET' });
      expect(list.status).toBe(200);
      expect(yield* Effect.promise(async () => list.json())).toMatchObject({
        items: [
          { ...library, name: 'HTTP renamed', storagePluginSettings: { _tag: 'Some', value: {} } },
        ],
        nextCursor: { _tag: 'Some', value: library.id },
      });
      const decoded = yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } });
      expect(decoded.items[0]?.storagePluginSettings).toEqual(Option.some({}));
      expect(decoded.nextCursor).toEqual(Option.some(library.id));
      const next = yield* send({
        path: `/api/libraries?limit=1&cursor=${library.id}`,
        method: 'GET',
      });
      expect(next.status).toBe(200);
      expect(yield* Effect.promise(async () => next.json())).toMatchObject({
        items: [{ ...trailing, name: 'HTTP trailing', storagePluginSettings: { _tag: 'None' } }],
        nextCursor: { _tag: 'None' },
      });
      const deleted = yield* send({ path, method: 'DELETE' });
      expect(deleted.status).toBe(204);
      expect(yield* Effect.promise(async () => deleted.text())).toBe('');
      expect(
        (yield* client.library.delete({ params: library, responseMode: 'response-only' })).status
      ).toBe(204);
      const missing = yield* send({ path, method: 'GET' });
      expect(missing.status).toBe(404);
      expect(yield* Effect.promise(async () => missing.json())).toEqual({
        _tag: 'LibraryNotFoundError',
        ...library,
      });
    })
  );

  iit.effect(
    'validates path and query values before handlers run',
    Effect.fnUntraced(function* () {
      const { send } = yield* makeWireTransport(
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
        const response = yield* send({ path, method: 'GET' });
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
      const { send } = yield* makeWireTransport(user);
      const response = yield* send({ path: '/api/libraries?limit=1', method: 'GET' });
      expect(response.status).toBe(status);
      expect(yield* Effect.promise(async () => response.json())).toEqual({ _tag: tag });
    })
  );
});
