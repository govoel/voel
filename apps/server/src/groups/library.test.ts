/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginSettings,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Deferred, Effect, Fiber, Layer, Option, RcMap, Schema } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { RpcMiddleware, RpcTest } from 'effect/unstable/rpc';

import { TursoClient } from '@repo/effect-turso';
import { Library } from '@repo/spec-api/database/schema.ts';
import { LibraryRpcs } from '@repo/spec-api/groups/library.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';
import { PluginLoadError } from '@repo/spec-api/plugins/index.ts';

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

class Input extends Schema.Struct({ root: Schema.NonEmptyString }) {}
class Persisted extends Schema.Struct({ prefix: Schema.NonEmptyString }) {}

class PluginFixture extends Context.Service<PluginFixture>()(
  '@repo/server/groups/library.test/PluginFixture',
  {
    make: Effect.sync(() => {
      const storageBuilds: Array<Parameters<StoragePluginModule['storage']['layer']>[0]> = [];
      const editorBuilds: Array<Parameters<StoragePluginModule['storage']['layerSettings']>[0]> =
        [];
      const finalized: Array<number> = [];
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
      };
      const module = {
        storage: {
          layer: (request) =>
            Layer.effect(
              StoragePlugin,
              Effect.gen(function* () {
                storageBuilds.push(request);
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    finalized.push(request.library.id);
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
                const decodeRoot = Schema.decodeEffect(
                  StorageRootLocation.check(Schema.isStartsWith('/'))
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
              Effect.sync(() => {
                editorBuilds.push(request);
                return StoragePluginSettings.of({
                  getForm: ({ current }) =>
                    Effect.gen(function* () {
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
                      Effect.andThen(Schema.decodeUnknownEffect(Input)(input)),
                      Effect.map(({ root }) =>
                        StoragePluginSettingsPersisted.make({ prefix: root.trim() })
                      )
                    ),
                });
              })
            ),
        },
      } satisfies StoragePluginModule;
      return { module, storageBuilds, editorBuilds, finalized, controls };
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

const testLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps)),
  Layer.provideMerge(AuthLayerNoDeps),
  Layer.provide(LibraryRepository.layerNoDeps),
  Layer.provideMerge(pluginLayer),
  Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer]),
  Layer.provide(BunPath.layer)
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
  return yield* RpcTest.makeClient(LibraryRpcs).pipe(
    Effect.provide(yield* makeAuthedClient({ username: 'libraryadmin', role: 'admin' }))
  );
});

it.layer(testLayer)('library lifecycle', (iit) => {
  iit.effect(
    'collects cached failures from both plugin components',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository.make;
      const library = yield* client.libraryCreate(createInput('Failed health', 'npm:missing'));
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({}),
      });
      expect(
        yield* client.libraryGetStoragePluginSettingsForm(library).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect(
        yield* client.libraryRootsSet({ ...library, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* client.libraryGet(library)).storagePluginHealth).toMatchObject({
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
      const fixture = yield* PluginFixture;
      const library = yield* client.libraryCreate(createInput('Health', 'npm:test'));
      const listItem = Effect.gen(function* () {
        return (yield* client.libraryList({ cursor: Option.none(), limit: 100 })).items.find(
          ({ id }) => id === library.id
        );
      });
      for (let index = 0; index < 2; index += 1) {
        expect((yield* client.libraryGet(library)).storagePluginHealth).toEqual({
          status: 'unknown',
        });
        expect(yield* listItem).toMatchObject({ storagePluginStatus: 'unknown' });
      }
      expect(fixture.editorBuilds.filter(({ library: row }) => row.id === library.id)).toEqual([]);
      expect(fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)).toEqual([]);

      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: 'unavailable' }),
      });
      // Persisted settings alone do not imply that storage is healthy.
      expect((yield* client.libraryGet(library)).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* client.libraryGetStoragePluginSettingsForm(library);
      expect((yield* client.libraryGet(library)).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'healthy' });
      expect(fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)).toEqual([]);

      yield* client.libraryRootsSet({ ...library, roots: [] }).pipe(Effect.flip);
      for (let index = 0; index < 2; index += 1) {
        expect((yield* client.libraryGet(library)).storagePluginHealth).toMatchObject({
          status: 'unhealthy',
          errors: [{ _tag: 'StoragePluginConstructionError', message: 'Storage unavailable' }],
        });
        const item = yield* listItem;
        expect(item).toMatchObject({ storagePluginStatus: 'unhealthy' });
        expect(item).not.toHaveProperty('storagePluginHealth');
      }
      expect(
        fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)
      ).toHaveLength(1);

      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/healthy' }),
      });
      expect((yield* client.libraryGet(library)).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* client.libraryRootsSet({ ...library, roots: [] });
      expect((yield* client.libraryGet(library)).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'healthy' });

      const stores = yield* StoragePluginMap;
      for (const key of yield* RcMap.keys(stores.rcMap)) {
        if (key.library.id === library.id) {
          yield* stores.invalidate(key);
        }
      }
      expect((yield* client.libraryGet(library)).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'unknown' });
      expect(
        fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)
      ).toHaveLength(2);
    })
  );

  iit.effect(
    'excludes cached health for obsolete settings and library context',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository.make;
      const fixture = yield* PluginFixture;
      const library = yield* client.libraryCreate(createInput('Stale health', 'npm:test'));
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: 'unavailable' }),
      });
      yield* client.libraryRootsSet({ ...library, roots: [] }).pipe(Effect.flip);
      expect((yield* client.libraryGet(library)).storagePluginHealth.status).toBe('unhealthy');

      // Leave old entries cached, as can happen while retirement is still in progress.
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: '/current' }),
      });
      expect((yield* client.libraryGet(library)).storagePluginHealth.status).toBe('unknown');
      yield* client.libraryGetStoragePluginSettingsForm(library);
      expect((yield* client.libraryGet(library)).storagePluginHealth.status).toBe('healthy');
      yield* repository.rename({
        ...library,
        name: Library.fields.name.make('New health context'),
      });
      expect((yield* client.libraryGet(library)).storagePluginHealth.status).toBe('unknown');
      expect(
        (yield* client.libraryList({ cursor: Option.none(), limit: 100 })).items.find(
          ({ id }) => id === library.id
        )
      ).toMatchObject({ storagePluginStatus: 'unknown' });
      expect(
        fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)
      ).toHaveLength(1);
      expect(fixture.editorBuilds.filter(({ library: row }) => row.id === library.id)).toHaveLength(
        1
      );
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
      const before = yield* repository.getById(library);
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
          .setRoots({
            ...library,
            roots: [StorageRootLocation.make('/rejected-root-replacement')],
          })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError' });
      expect((yield* repository.getById(library)).roots).toEqual(before.roots);
    })
  );

  iit.effect(
    'creates unconfigured libraries and explicitly configures local storage',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const sql = yield* LibraryDatabase;
      const library = yield* client.libraryCreate(createInput('Local'));
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(Option.none());
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
        (yield* client.libraryList({ cursor: Option.none(), limit: 100 })).items.some(
          ({ id }) => id === library.id
        )
      ).toBe(true);
      expect(
        yield* client.libraryRootsSet({ ...library, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryUnconfiguredError' });
      expect(yield* client.libraryGetStoragePluginSettingsForm(library)).toEqual([]);
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({}),
      });
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(Option.some({}));
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
        yield* client
          .libraryRootsSet({ ...library, roots: [{ root: 'relative' }] })
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
      const library = yield* client.libraryCreate(createInput('Invalid roots'));
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({}),
      });
      yield* client.libraryRootsSet({ ...library, roots: [{ root: '/original' }] });
      const before = yield* client.libraryGet(library);
      expect(
        yield* client
          .libraryRootsSet({
            ...library,
            roots: [{ root: 'relative' }, { root: '/valid' }, { root: '/nul\0' }],
          })
          .pipe(Effect.flip)
      ).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [
          { root: 'relative', message: 'Library root locations must be absolute paths' },
          { root: '/nul\0', message: 'Library root locations must not contain NUL characters' },
        ],
      });
      expect((yield* client.libraryGet(library)).roots).toEqual(before.roots);
    })
  );

  iit.effect(
    'defers plugin loading and rejects name conflicts without resurrecting rows',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const missing = yield* client.libraryCreate(createInput('Missing plugin', 'npm:missing'));
      expect(yield* client.libraryGet(missing)).toMatchObject({
        storagePlugin: 'npm:missing',
        storagePluginSettings: Option.none(),
        storagePluginHealth: { status: 'unknown' },
      });
      expect(
        yield* client.libraryGetStoragePluginSettingsForm(missing).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* client.libraryGet(missing)).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [{ _tag: 'PluginLoadError', message: 'Plugin unavailable' }],
      });
      expect(
        (yield* client.libraryList({ cursor: Option.none(), limit: 100 })).items.find(
          ({ id }) => id === missing.id
        )
      ).toMatchObject({ storagePluginStatus: 'unhealthy' });
      const original = yield* client.libraryCreate(createInput('Unique'));
      expect(yield* client.libraryCreate(createInput('Unique')).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNameConflictError',
      });
      const other = yield* client.libraryCreate(createInput('Other'));
      expect(
        yield* client
          .libraryUpdate({ ...other, name: Library.fields.name.make('Unique') })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNameConflictError' });
      expect((yield* client.libraryGet(other)).name).toBe('Other');
      yield* client.libraryDelete(original);
      yield* client.libraryDelete(original);
      expect(
        yield* client
          .libraryUpdate({ ...original, name: Library.fields.name.make('Gone') })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNotFoundError' });
      const recreated = yield* client.libraryCreate(createInput('Unique'));
      expect(recreated.id).not.toBe(original.id);
    })
  );

  iit.effect(
    'round-trips transformed settings, retries setup with stable identity, and isolates caches',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.libraryCreate(createInput('Remote', 'npm:test'));
      expect(
        fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)
      ).toHaveLength(0);
      yield* client.libraryGetStoragePluginSettingsForm(library);
      yield* client.libraryGetStoragePluginSettingsForm(library);
      expect(fixture.editorBuilds.filter(({ library: row }) => row.id === library.id)).toHaveLength(
        1
      );
      const failure = yield* client
        .librarySetStoragePluginSettings({
          ...library,
          input: StoragePluginSettingsInput.make({ root: 123 }),
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: 'StoragePluginSettingsError',
        message: 'Invalid storage plugin settings',
      });
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(Option.none());
      yield* client.libraryGetStoragePluginSettingsForm(library);
      expect(fixture.editorBuilds.filter(({ library: row }) => row.id === library.id)).toHaveLength(
        1
      );
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: 'unavailable' }),
      });
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(
        Option.some({ prefix: 'unavailable' })
      );
      expect(
        yield* client.libraryRootsSet({ ...library, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      expect(yield* client.libraryGetStoragePluginSettingsForm(library)).toMatchObject([
        { initialValue: 'unavailable', label: 'Remote' },
      ]);
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: ' /remote ' }),
      });
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(
        Option.some({ prefix: '/remote' })
      );
      expect(fixture.finalized.filter((id) => id === library.id)).toHaveLength(1);
      expect(yield* client.libraryGetStoragePluginSettingsForm(library)).toMatchObject([
        { initialValue: '/remote', label: 'Remote' },
      ]);
      expect(fixture.editorBuilds.filter(({ library: row }) => row.id === library.id)).toHaveLength(
        3
      );
      yield* client.libraryRootsSet({ ...library, roots: [{ root: ' /one ' }, { root: '/one' }] });
      const before = yield* client.libraryGet(library);
      expect(before.roots).toHaveLength(1);
      expect(before.roots[0]?.root).toBe('/one');
      yield* client.libraryRootsSet({ ...library, roots: [{ root: '/one' }] });
      expect((yield* client.libraryGet(library)).roots).toEqual(before.roots);
      expect(
        fixture.storageBuilds.filter(({ library: row }) => row.id === library.id)
      ).toHaveLength(2);
      yield* client.libraryUpdate({ ...library, name: Library.fields.name.make('Rejected') });
      expect((yield* client.libraryGet(library)).name).toBe('Rejected');
      expect(
        yield* client.libraryRootsSet({ ...library, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      yield* client.libraryUpdate({ ...library, name: Library.fields.name.make('Renamed') });
      expect(yield* client.libraryGetStoragePluginSettingsForm(library)).toMatchObject([
        { label: 'Renamed', initialValue: '/remote' },
      ]);
      const second = yield* client.libraryCreate(createInput('Second remote', 'npm:test'));
      yield* client.libraryGetStoragePluginSettingsForm(second);
      expect(fixture.editorBuilds.filter(({ library: row }) => row.id === second.id)).toHaveLength(
        1
      );
      fixture.controls.invalidForm = true;
      expect(
        yield* client.libraryGetStoragePluginSettingsForm(second).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginSettingsError' });
      fixture.controls.invalidForm = false;
      yield* client.libraryRootsSet({ ...library, roots: [] });
      expect((yield* client.libraryGet(library)).roots).toEqual([]);
    })
  );

  iit.effect(
    'returns before idle plugin cleanup finishes and retires beyond the request scope',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const library = yield* client.libraryCreate(createInput('Background retirement', 'npm:test'));
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/background' }),
      });
      yield* client.libraryRootsSet({ ...library, roots: [{ root: '/one' }] });

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
        client.libraryUpdate({
          ...library,
          name: Library.fields.name.make('Background renamed'),
        })
      );
      expect(response).toEqual(library);
      yield* Deferred.await(started);
      expect(yield* Deferred.isDone(finished)).toBe(false);
      expect((yield* client.libraryGet(library)).name).toBe('Background renamed');
      const stores = yield* StoragePluginMap;
      expect(
        [...(yield* RcMap.keys(stores.rcMap))].some((key) => key.library.id === library.id)
      ).toBe(false);
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
      const library = yield* client.libraryCreate(createInput('Locked root context', 'npm:test'));
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
      });
      yield* client.libraryRootsSet({ ...library, roots: [{ root: '/original' }] });
      const before = yield* client.libraryGet(library);
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
      const pending = yield* client
        .libraryRootsSet({ ...library, roots: [{ root: '/pending' }] })
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
      expect(yield* client.libraryGet(library)).toMatchObject({
        name: before.name,
        storagePluginSettings: before.storagePluginSettings,
        roots: before.roots,
      });
      yield* Deferred.succeed(release, true);
      expect(yield* Fiber.join(pending)).toEqual({
        ...library,
        roots: [{ root: '/pending' }],
      });
      expect((yield* client.libraryGet(library)).roots.map(({ root }) => root)).toEqual([
        '/pending',
      ]);
      yield* client.libraryUpdate({
        ...library,
        name: Library.fields.name.make('Renamed root context'),
      });
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/updated' }),
      });
      expect(yield* client.libraryGet(library)).toMatchObject({
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
      const library = yield* client.libraryCreate(createInput('Concurrent metadata', 'npm:test'));
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
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
      const settings = yield* client
        .librarySetStoragePluginSettings({
          ...library,
          input: StoragePluginSettingsInput.make({ root: '/pending-settings' }),
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(settingsStarted);
      // Renaming while decoding is blocked must not overwrite settings or hold a write lock.
      yield* client.libraryUpdate({ ...library, name: Library.fields.name.make('Final name') });
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(
        Option.some({ prefix: '/initial' })
      );
      yield* Deferred.succeed(settingsRelease, true);
      yield* Fiber.join(settings);
      expect(yield* client.libraryGet(library)).toMatchObject({
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
      const library = yield* client.libraryCreate(createInput('Concurrent settings', 'npm:test'));
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
      const slow = yield* client
        .librarySetStoragePluginSettings({
          ...library,
          input: StoragePluginSettingsInput.make({ root: '/slow' }),
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/fast' }),
      });
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(slow);
      expect((yield* client.libraryGet(library)).storagePluginSettings).toEqual(
        Option.some({ prefix: '/slow' })
      );
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'deletion during settings decoding returns not-found and retires caches',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const stores = yield* StoragePluginMap;
      const editors = yield* StoragePluginSettingsMap;
      const library = yield* client.libraryCreate(
        createInput('Delete pending settings', 'npm:test')
      );
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
      });
      yield* client.libraryGetStoragePluginSettingsForm(library);
      yield* client.libraryRootsSet({ ...library, roots: [{ root: '/one' }] });
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      const pending = yield* client
        .librarySetStoragePluginSettings({
          ...library,
          input: StoragePluginSettingsInput.make({ root: '/deleted' }),
        })
        .pipe(Effect.flip, Effect.forkChild);
      yield* Deferred.await(started);
      yield* client.libraryDelete(library);
      // Retirement is asynchronous; wait for removal rather than response delivery.
      yield* Effect.gen(function* () {
        yield* Effect.yieldNow;
        const storageKeys = yield* RcMap.keys(stores.rcMap);
        const editorKeys = yield* RcMap.keys(editors.rcMap);
        return [...storageKeys, ...editorKeys].some((key) => key.library.id === library.id);
      }).pipe(Effect.repeat({ while: (present) => present }));
      expect(
        [...(yield* RcMap.keys(stores.rcMap))].some((key) => key.library.id === library.id)
      ).toBe(false);
      expect(
        [...(yield* RcMap.keys(editors.rcMap))].some((key) => key.library.id === library.id)
      ).toBe(false);
      yield* Deferred.succeed(release, true);
      expect(yield* Fiber.join(pending)).toMatchObject({ _tag: 'LibraryNotFoundError' });
      expect(fixture.finalized.filter((id) => id === library.id)).toHaveLength(1);
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'hard deletion cascades roots and mappings but preserves shared media',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const sql = yield* LibraryDatabase;
      const library = yield* client.libraryCreate(createInput('Delete cascade'));
      yield* client.librarySetStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({}),
      });
      yield* client.libraryRootsSet({ ...library, roots: [{ root: '/delete' }] });
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
      yield* client.libraryDelete(library);
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
      expect(yield* client.libraryGet(library).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
    })
  );

  iit.effect(
    'paginates admin listings including libraries awaiting setup',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const marker = yield* client.libraryCreate(createInput('Page marker'));
      const first = yield* client.libraryCreate(createInput('Page first'));
      const second = yield* client.libraryCreate(createInput('Page second'));
      const page = yield* client.libraryList({ cursor: Option.some(marker.id), limit: 1 });
      expect(page.items.map(({ id }) => id)).toEqual([first.id]);
      expect(page.nextCursor).toEqual(Option.some(first.id));
      const last = yield* client.libraryList({ cursor: page.nextCursor, limit: 10 });
      expect(last.items.map(({ id }) => id)).toEqual([second.id]);
      expect(last.nextCursor).toEqual(Option.none());
    })
  );

  iit.effect(
    'rejects unauthenticated requests',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(LibraryRpcs).pipe(
        Effect.provide(
          RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request))
        )
      );
      expect(
        yield* client.libraryCreate(createInput('Unauthorized')).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'UnauthorizedError' });
      expect(
        yield* client.libraryList({ cursor: Option.none(), limit: 1 }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'UnauthorizedError' });
    })
  );
  iit.effect.each(['user', 'under18'] as const)(
    'rejects non-admin %s requests',
    Effect.fnUntraced(function* (role) {
      const client = yield* RpcTest.makeClient(LibraryRpcs).pipe(
        Effect.provide(yield* makeAuthedClient({ username: role, role }))
      );
      expect(yield* client.libraryCreate(createInput('Forbidden')).pipe(Effect.flip)).toMatchObject(
        { _tag: 'ForbiddenError' }
      );
      expect(
        yield* client.libraryList({ cursor: Option.none(), limit: 1 }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
    })
  );
});
