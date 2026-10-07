/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem, BunHttpServer, BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginInvalidSettingsError,
  StoragePluginSettings,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Effect, Exit, Fiber, Latch, Layer, Option, Scheduler, Schema } from 'effect';
import {
  FetchHttpClient,
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
import { Library } from '@repo/spec-api/database/schema.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';
import { PluginLoadError } from '@repo/spec-api/plugins/index.ts';

import { ApiRoutesLayerNoDeps } from '#src/groups/index.ts';
import { LibraryHandlersLayerNoDeps, LibraryRepository } from '#src/groups/library.ts';
import { makeAuthedClient } from '#src/groups/utils.ts';
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

class Input extends Schema.Struct({ root: Schema.NonEmptyString }) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);

  public static readonly is = Schema.is(this);
}

class Persisted extends Schema.Struct({ prefix: Schema.NonEmptyString }) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

// Share one dispatcher so tests can drain runnable work from every handler/cache fiber.
// Draining does not wait for promises, timers, or deliberately blocked finalizers.
class TestScheduler extends Context.Service<TestScheduler>()(
  '@repo/server/groups/library.test/TestScheduler',
  {
    make: Effect.sync(() => {
      const scheduler = new Scheduler.MixedScheduler();
      const dispatcher = scheduler.makeDispatcher();
      return {
        scheduler: {
          executionMode: scheduler.executionMode,
          shouldYield: (fiber) => scheduler.shouldYield(fiber),
          makeDispatcher: () => dispatcher,
        } satisfies Scheduler.Scheduler,
        drainScheduler: Effect.sync(() => {
          dispatcher.flush();
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.unwrap(
    this.pipe(Effect.map(({ scheduler }) => Layer.succeed(Scheduler.Scheduler, scheduler)))
  ).pipe(Layer.provideMerge(Layer.effect(this, this.make)));
}

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
                const settings = yield* Persisted.decodeUnknownEffect(request.settings).pipe(
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
                        ? yield* Persisted.decodeUnknownEffect(current.value).pipe(
                            Effect.catchTag('SchemaError', () =>
                              StoragePluginSettingsError.make({
                                message:
                                  'Storage plugin could not build the settings form from the current settings',
                              })
                            )
                          )
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
                      Effect.andThen(
                        Input.decodeUnknownEffect(input).pipe(
                          Effect.catchTag('SchemaError', () =>
                            StoragePluginInvalidSettingsError.make({
                              message: 'Submitted storage plugin settings failed validation',
                            })
                          )
                        )
                      ),
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

// Build handlers once so background retirement lives for the suite, not client creation.
const testLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provideMerge(testDependenciesLayer),
  Layer.provideMerge(TestScheduler.layer)
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
  return yield* HttpApiTest.groups(Api, ['library']).pipe(Effect.provide(auth.layer));
});

it.layer(testLayer)('library lifecycle', (iit) => {
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
      const { drainScheduler } = yield* TestScheduler;
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
      yield* drainScheduler;
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
      yield* drainScheduler;
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
      yield* drainScheduler;
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
        _tag: 'StoragePluginInvalidSettingsError',
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

      // Closing this caller scope must not interrupt or await retirement.
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
      expect(yield* client.library.getStoragePluginSettingsForm({ params: library })).toMatchObject(
        [{ label: 'Background renamed', initialValue: '/background' }]
      );
      expect(
        (yield* client.library.get({ params: library })).roots.map(({ root }) => root)
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
      yield* release.open;
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
      const settingsStarted = yield* Latch.make();
      const settingsRelease = yield* Latch.make();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id &&
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
      // Renaming while decoding is blocked must not overwrite settings or hold a write lock.
      yield* client.library.update({
        params: library,
        payload: { name: Library.fields.name.make('Final name') },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/initial' })
      );
      yield* settingsRelease.open;
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
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id &&
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
      const retired = yield* Latch.make();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id ? retired.open.pipe(Effect.asVoid) : Effect.void;
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id
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
        [...fixture.activeStorage].filter(({ library: row }) => row.id === library.id)
      ).toEqual([]);
      yield* release.open;
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
      const client = yield* HttpApiTest.groups(Api, ['library']).pipe(
        Effect.provide(
          HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request))
        )
      );
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
      const client = yield* HttpApiTest.groups(Api, ['library']).pipe(Effect.provide(auth.layer));
      expect(
        yield* client.library.create({ payload: createInput('Forbidden') }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
      expect(
        yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
    })
  );
});

// Use Effect's request/response adapters; only this client talks to the in-memory web handler.
const makeWireTransport = Effect.fnUntraced(function* (
  user: Option.Option<Parameters<typeof makeAuthedClient>[0]>
) {
  const headers = Option.isSome(user)
    ? (yield* makeAuthedClient(user.value)).headers
    : Headers.empty;
  const handler = HttpEffect.toWebHandler(yield* HttpRouter.toHttpEffect(Layer.empty));
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
          request.library.id === library.id
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
      yield* repository.setSettings({ ...library, settings: original });
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
      yield* repository.setSettings({ ...library, settings: original });
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
      // Defects must not expose schema diagnostics or submitted values over HTTP.
      expect(yield* response.text).toBe('');
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some(original)
      );
    })
  );

  iit.effect(
    'encodes Option JSON and returns bodyless, idempotent deletion',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_admin', role: 'admin' })
      );
      const library = yield* client.library.create({ payload: createInput('HTTP library') });
      const get = yield* client.library.get({ params: library, responseMode: 'response-only' });
      expect(get.headers['content-type']).toContain('application/json');
      expect(yield* get.json).toMatchObject({
        ...library,
        storagePluginSettings: { _tag: 'None' },
        storagePluginHealth: { status: 'unknown' },
      });
      yield* client.library.setStoragePluginSettings({
        params: library,
        payload: { input: StoragePluginSettingsInput.make({}) },
      });
      const list = yield* client.library.list({
        query: { cursor: Option.none(), limit: 1 },
        responseMode: 'response-only',
      });
      expect(yield* list.json).toMatchObject({
        items: [{ ...library, storagePluginSettings: { _tag: 'Some', value: {} } }],
        nextCursor: { _tag: 'None' },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const deleted = yield* client.library.delete({
          params: library,
          responseMode: 'response-only',
        });
        expect(deleted.status).toBe(204);
        expect(yield* deleted.text).toBe('');
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
      expect(yield* response.json).toEqual({ _tag: tag });
    })
  );
});
