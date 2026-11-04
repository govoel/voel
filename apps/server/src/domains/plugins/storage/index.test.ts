import { expect, it } from '@effect/vitest';
import { Library } from '@govoel/plugins/library';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginSettings,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import {
  Array,
  Clock,
  ConfigProvider,
  Context,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Latch,
  Layer,
  Option,
  Order,
  Path,
  References,
  Scope,
  String,
} from 'effect';
import { HttpClient } from 'effect/http';

import { StoragePluginId } from '@repo/spec-api/domains/plugins/storage.ts';

import { PluginModuleMap } from '#src/domains/plugins/index.ts';
import {
  StoragePluginBuilder,
  StoragePluginMap,
  StoragePluginModuleMap,
  StoragePluginSettingsMap,
} from '#src/domains/plugins/storage/index.ts';
import local from '#src/domains/plugins/storage/local/index.ts';
import { StoragePluginKey, StoragePluginSettingsKey } from '#src/domains/plugins/storage/schema.ts';

class PrivateService extends Context.Service<PrivateService>()(
  '@repo/server/domains/plugins/storage/index.test/PrivateService',
  { make: Effect.succeed('private') }
) {}

const request = {
  library: Library.make({
    id: Library.fields.id.make(1),
    type: Library.fields.type.make('movie'),
    name: Library.fields.name.make('Movies'),
  }),
  storagePlugin: StoragePluginId.make('builtin:local'),
  settings: StoragePluginSettingsPersisted.make({ directory: '/library' }),
};

const storageRequest = StoragePluginKey.make(request);
const settingsRequest = StoragePluginSettingsKey.make(request);

const storageLayer = Layer.succeed(StoragePlugin, {
  decodeRootLocation: ({ location }) => Effect.succeed(StorageRootLocation.make(location)),
  decodeMediaFileLocation: ({ location }) =>
    Effect.succeed(StorageMediaFileLocation.make(location)),
});

const settingsLayer = Layer.succeed(StoragePluginSettings, {
  getForm: () =>
    Effect.succeed([
      {
        _tag: 'TextField',
        name: StoragePluginSettingsForm.value.fields.name.make('directory'),
        label: 'Directory',
        placeholder: '',
        initialValue: '/library',
      },
    ]),
  decodeFormSubmission: () => Effect.succeed(request.settings),
});

const snapshotMetadata = Effect.all({
  annotations: References.CurrentLogAnnotations,
  spans: References.CurrentLogSpans,
  level: References.CurrentLogLevel,
});

const snapshotContext = Effect.all({
  metadata: snapshotMetadata,
  services: Effect.all({
    privateService: Effect.serviceOption(PrivateService),
    moduleMap: Effect.serviceOption(StoragePluginModuleMap),
    sharedModuleMap: Effect.serviceOption(PluginModuleMap),
    builder: Effect.serviceOption(StoragePluginBuilder),
  }),
});

const noPrivateServices = {
  privateService: Option.none(),
  moduleMap: Option.none(),
  sharedModuleMap: Option.none(),
  builder: Option.none(),
};

const platformLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die('Unexpected HTTP request'))
  )
);

const makeMaps = (module: StoragePluginModule) =>
  Layer.mergeAll(StoragePluginMap.layerNoDeps, StoragePluginSettingsMap.layerNoDeps).pipe(
    Layer.provide(StoragePluginBuilder.layerNoDeps),
    Layer.provide([
      platformLayer,
      Layer.succeed(StoragePluginModuleMap, {
        get: (plugin) =>
          Effect.sync(() => {
            expect(plugin).toBe(request.storagePlugin);
            return module;
          }),
      }),
    ])
  );

it.effect('acquires canonical plugin services until the caller releases its scope', () => {
  const builtLibraries: Array<typeof request.library> = [];
  let released = 0;
  const onRelease = () =>
    Effect.sync(() => {
      released += 1;
    });
  const module = {
    storage: {
      layer: ({ library }) => {
        builtLibraries.push(library);
        return storageLayer.pipe(Layer.tap(() => Effect.addFinalizer(onRelease)));
      },
      layerSettings: ({ library }) => {
        if (library._tag === 'Existing') {
          builtLibraries.push(library);
        }
        return settingsLayer.pipe(Layer.tap(() => Effect.addFinalizer(onRelease)));
      },
    },
  } satisfies StoragePluginModule;

  return Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const first = { ...request, library: { ...request.library, roots: ['/first'] } };
      const second = { ...request, library: { ...request.library, roots: ['/second'] } };
      const firstStorageKey = StoragePluginKey.make(first);
      const secondStorageKey = StoragePluginKey.make(second);
      const firstSettingsKey = StoragePluginSettingsKey.make(first);
      const secondSettingsKey = StoragePluginSettingsKey.make(second);
      const stores = yield* StoragePluginMap;
      const editors = yield* StoragePluginSettingsMap;
      const scope = yield* Effect.scope;
      const caller = Context.make(Scope.Scope, scope);
      const firstStorage = yield* stores.acquire(firstStorageKey).pipe(Effect.setContext(caller));
      const firstSettings = yield* editors
        .acquire({
          storagePlugin: firstSettingsKey.storagePlugin,
          library: { _tag: 'Existing', ...firstSettingsKey.library },
        })
        .pipe(Effect.setContext(caller));
      const secondStorage = yield* stores.acquire(secondStorageKey).pipe(Effect.setContext(caller));
      const secondSettings = yield* editors
        .acquire({
          storagePlugin: secondSettingsKey.storagePlugin,
          library: { _tag: 'Existing', ...secondSettingsKey.library },
        })
        .pipe(Effect.setContext(caller));
      expect(builtLibraries).toEqual([request.library, { _tag: 'Existing', ...request.library }]);
      expect(firstStorage).toBe(secondStorage);
      expect(firstSettings).toBe(secondSettings);

      yield* stores.invalidate(secondStorageKey);
      yield* editors.invalidate(secondSettingsKey);
      expect(released).toBe(0);
    }).pipe(Effect.scoped);
    expect(released).toBe(2);
  }).pipe(Effect.provide(makeMaps(module)));
});

it.effect('keeps draft editors request scoped and separate from existing cache entries', () => {
  const seen: Array<Parameters<StoragePluginModule['storage']['layerSettings']>[0]['library']> = [];
  let released = 0;
  const module = {
    storage: {
      layer: () => storageLayer,
      layerSettings: ({ library }) => {
        seen.push(library);
        return Layer.succeed(
          StoragePluginSettings,
          StoragePluginSettings.of({
            decodeFormSubmission: () => Effect.succeed(request.settings),
            getForm: () =>
              Effect.succeed([
                {
                  _tag: 'TextField',
                  name: StoragePluginSettingsForm.value.fields.name.make('directory'),
                  label: library.name,
                  placeholder: '',
                  initialValue: '',
                },
              ]),
          })
        ).pipe(
          Layer.tap(() =>
            Effect.addFinalizer(() =>
              Effect.sync(() => {
                released += 1;
              })
            )
          )
        );
      },
    },
  } satisfies StoragePluginModule;
  return Effect.gen(function* () {
    const editors = yield* StoragePluginSettingsMap;
    const existing = {
      storagePlugin: request.storagePlugin,
      library: { _tag: 'Existing' as const, ...request.library },
    };
    const draft = {
      storagePlugin: request.storagePlugin,
      library: { _tag: 'Draft' as const, name: request.library.name, type: request.library.type },
    };
    yield* Effect.scoped(
      Effect.gen(function* () {
        const cached = yield* editors.acquire(existing);
        const first = yield* Effect.scoped(
          Effect.gen(function* () {
            const editor = yield* editors.acquire(draft);
            return yield* editor.getForm({ current: Option.none() });
          })
        );
        const secondDraft = {
          ...draft,
          library: { ...draft.library, name: Library.fields.name.make('Other draft') },
        };
        const second = yield* Effect.scoped(
          Effect.gen(function* () {
            const editor = yield* editors.acquire(secondDraft);
            return yield* editor.getForm({ current: Option.none() });
          })
        );
        expect(first[0]?.label).toBe('Movies');
        expect(second[0]?.label).toBe('Other draft');
        expect(yield* editors.acquire(existing)).toBe(cached);
        expect(seen).toEqual([existing.library, draft.library, secondDraft.library]);
        expect(Array.every(Array.drop(seen, 1), (library) => !('id' in library))).toBe(true);
        expect(released).toBe(2);
      })
    );
  }).pipe(Effect.provide(makeMaps(module)));
});

it.effect(
  'resolves built-in storage without loading an npm module',
  Effect.fnUntraced(
    function* () {
      const modules = yield* StoragePluginModuleMap;
      const module = yield* modules.get(StoragePluginId.make('builtin:local'));
      const context = yield* Layer.build(
        module.storage.layer(request).pipe(Layer.provide(platformLayer))
      );
      const storage = Context.get(context, StoragePlugin);
      const decodeRootLocationResult = yield* storage.decodeRootLocation({
        location: '/books/../audio',
      });
      expect(decodeRootLocationResult).toBe('/audio');
    },
    Effect.scoped,
    Effect.provide(StoragePluginModuleMap.layerNoDeps),
    Effect.provideService(PluginModuleMap, {
      get: () => Effect.die('Unexpected npm module lookup'),
    })
  )
);

it.effect(
  'validates storage exports from the shared module loader',
  Effect.fnUntraced(
    function* () {
      const modules = yield* StoragePluginModuleMap;
      const module = yield* modules.get(StoragePluginId.make('npm:fixture'));
      const context = yield* Layer.build(
        module.storage.layer(request).pipe(Layer.provide(platformLayer))
      );
      const storage = Context.get(context, StoragePlugin);
      const decodeMediaFileLocationResult = yield* storage.decodeMediaFileLocation({
        location: '/audio/./book.mp3',
      });
      expect(decodeMediaFileLocationResult).toBe('/audio/book.mp3');
    },
    Effect.scoped,
    Effect.provide(StoragePluginModuleMap.layerNoDeps),
    Effect.provideService(PluginModuleMap, {
      get: (plugin) => {
        expect(plugin).toBe('npm:fixture');
        return Effect.succeed({ default: local, unrelated: 'preserved in shared cache' });
      },
    })
  )
);

it.effect.each([
  null,
  {},
  { default: {} },
  { default: { storage: { layer: () => storageLayer } } },
  { default: { storage: { layer: 'invalid', layerSettings: () => settingsLayer } } },
])(
  'rejects an invalid storage module export: %j',
  Effect.fnUntraced(
    function* (_module: unknown) {
      const modules = yield* StoragePluginModuleMap;
      const error = yield* modules.get(StoragePluginId.make('npm:fixture')).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'StoragePluginLoadError',
        message: 'Invalid storage plugin module',
      });
    },
    Effect.provide(StoragePluginModuleMap.layerNoDeps),
    (effect, module) =>
      effect.pipe(Effect.provideService(PluginModuleMap, { get: () => Effect.succeed(module) }))
  )
);

it.effect(
  'reports malformed settings outputs as defects at the plugin boundary',
  Effect.fnUntraced(
    function* () {
      const editors = yield* StoragePluginSettingsMap;
      const settings = yield* editors.acquire({
        storagePlugin: settingsRequest.storagePlugin,
        library: { _tag: 'Existing', ...settingsRequest.library },
      });
      const formExit = yield* settings.getForm({ current: Option.none() }).pipe(Effect.exit);
      expect(Exit.hasDies(formExit)).toBe(true);
      expect(Exit.findDefect(formExit)).toMatchObject({
        _tag: 'Success',
        success: { _tag: 'SchemaError' },
      });
      const submissionExit = yield* settings
        .decodeFormSubmission({
          current: Option.none(),
          input: StoragePluginSettingsInput.make({}),
        })
        .pipe(Effect.exit);
      expect(Exit.hasDies(submissionExit)).toBe(true);
      expect(Exit.findDefect(submissionExit)).toMatchObject({
        _tag: 'Success',
        success: { _tag: 'SchemaError' },
      });
    },
    Effect.scoped,
    Effect.provide(
      makeMaps({
        storage: {
          layer: () => storageLayer,
          layerSettings: () =>
            Layer.succeed(StoragePluginSettings, {
              getForm: () => {
                const field = StoragePluginSettingsForm.value.make({
                  _tag: 'TextField',
                  name: StoragePluginSettingsForm.value.fields.name.make('directory'),
                  label: 'Directory',
                  placeholder: '',
                  initialValue: '',
                });
                return Effect.succeed([field, field]);
              },
              decodeFormSubmission: () => {
                const value = { value: 0 };
                const settings = StoragePluginSettingsPersisted.make(value);
                value.value = Number.NaN;
                return Effect.succeed(settings);
              },
            }),
        },
      })
    )
  )
);

it.effect.each(['decodeRootLocation', 'decodeMediaFileLocation'] as const)(
  'validates %s outputs while preserving plugin normalization',
  Effect.fnUntraced(
    function* (method) {
      const stores = yield* StoragePluginMap;
      const storage = yield* stores.acquire(storageRequest);
      const decodedLocation = yield* storage[method]({ location: ' /library ' });
      expect(decodedLocation).toBe('/library');
      const result: Effect.Effect<string, StorageLocationValidationError> = storage[method]({
        location: ' ',
      });
      const exit = yield* Effect.exit(result);
      expect(Exit.hasDies(exit)).toBe(true);
      expect(Exit.findDefect(exit)).toMatchObject({
        _tag: 'Success',
        success: { _tag: 'SchemaError' },
      });
    },
    Effect.scoped,
    Effect.provide(
      makeMaps({
        storage: {
          layer: () =>
            Layer.succeed(StoragePlugin, {
              decodeRootLocation: ({ location }) =>
                Effect.succeed(
                  StorageRootLocation.make(String.trim(location), { disableChecks: true })
                ),
              decodeMediaFileLocation: ({ location }) =>
                Effect.succeed(
                  StorageMediaFileLocation.make(String.trim(location), { disableChecks: true })
                ),
            }),
          layerSettings: () => settingsLayer,
        },
      })
    )
  )
);

it.effect.each(['decodeRootLocation', 'decodeMediaFileLocation'] as const)(
  'canonicalizes local paths with %s',
  Effect.fnUntraced(
    function* (method) {
      const stores = yield* StoragePluginMap;
      const storage = yield* stores.acquire(storageRequest);
      for (const { location, canonical } of [
        { location: '/books/../audio', canonical: '/audio' },
        { location: '/audio/./', canonical: '/audio' },
        { location: '//audio//', canonical: '/audio' },
        { location: '/books/../audio/./track.mp3', canonical: '/audio/track.mp3' },
        { location: '/audio/..', canonical: '/' },
      ]) {
        const decoded = yield* storage[method]({ location });
        expect(decoded).toBe(canonical);
        const decodedLocation = yield* storage[method]({ location: canonical });
        expect(decodedLocation).toBe(canonical);
      }
    },
    Effect.scoped,
    Effect.provide(makeMaps(local))
  )
);

it.effect.each([
  { method: 'decodeRootLocation', label: 'Library root locations' },
  { method: 'decodeMediaFileLocation', label: 'Library file locations' },
] as const)(
  'returns client-safe validation messages from local $method',
  Effect.fnUntraced(
    function* ({ method, label }) {
      const stores = yield* StoragePluginMap;
      const storage = yield* stores.acquire(storageRequest);
      const decode: (
        input: Parameters<typeof storage.decodeRootLocation>[0]
      ) => Effect.Effect<string, StorageLocationValidationError> = storage[method];
      const decodeResult = yield* decode({ location: '/library' });
      expect(decodeResult).toBe('/library');
      const decodeError = yield* decode({ location: 'relative' }).pipe(Effect.flip);
      expect(decodeError).toEqual(
        StorageLocationValidationError.make({ message: `${label} must be absolute paths` })
      );
      const decodeError2 = yield* decode({ location: '/nul\0' }).pipe(Effect.flip);
      expect(decodeError2).toEqual(
        StorageLocationValidationError.make({ message: `${label} must not contain NUL characters` })
      );
      const decodeError3 = yield* decode({ location: '' }).pipe(Effect.flip);
      expect(decodeError3).toMatchObject({
        _tag: 'StorageLocationValidationError',
        message: 'Expected a value with a length of at least 1',
      });
    },
    Effect.scoped,
    Effect.provide(makeMaps(local))
  )
);

it.effect.each(['decodeRootLocation', 'decodeMediaFileLocation'] as const)(
  'preserves plugin validation failures from %s',
  (method) => {
    const error = StorageLocationValidationError.make({ message: 'Location is outside storage' });
    return Effect.gen(function* () {
      const stores = yield* StoragePluginMap;
      const storage = yield* stores.acquire(storageRequest);
      const result: Effect.Effect<string, StorageLocationValidationError> = storage[method]({
        location: '/outside',
      });
      const resultError = yield* Effect.flip(result);
      expect(resultError).toMatchObject({
        _tag: 'StorageLocationValidationError',
        message: 'Location is outside storage',
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(
        makeMaps({
          storage: {
            layer: () =>
              Layer.succeed(StoragePlugin, {
                decodeRootLocation: () => error,
                decodeMediaFileLocation: () => error,
              }),
            layerSettings: () => settingsLayer,
          },
        })
      )
    );
  }
);

it.effect(
  'isolates the plugin lifecycle and forwards factory and method inputs',
  Effect.fnUntraced(function* () {
    const clock = yield* Clock.Clock;
    const provider = ConfigProvider.fromUnknown({ TOKEN: 'server-only' });
    const current = Option.some(StoragePluginSettingsPersisted.make({ directory: '/previous' }));
    const inputs = {
      root: { location: '/library' },
      file: { location: '/library/file' },
      form: { current },
      submission: {
        current,
        input: StoragePluginSettingsInput.make({ directory: '/submitted' }),
      },
    };
    const inspect = () => {
      const context = Fiber.getCurrent()?.context ?? Context.empty();
      expect(Context.getOption(context, PrivateService)).toEqual(Option.none());
      expect(Context.getOption(context, StoragePluginModuleMap)).toEqual(Option.none());
      expect(Context.getOption(context, StoragePluginBuilder)).toEqual(Option.none());
      expect(Option.isSome(Context.getOption(context, FileSystem.FileSystem))).toBe(true);
      expect(Option.isSome(Context.getOption(context, Path.Path))).toBe(true);
      expect(Option.isSome(Context.getOption(context, HttpClient.HttpClient))).toBe(true);
      expect(Context.get(context, ConfigProvider.ConfigProvider)).toBe(provider);
      expect(Context.get(context, Clock.Clock)).toBe(clock);
    };
    const execute = Effect.fnUntraced(function* <A>({ value }: { readonly value: A }) {
      inspect();
      yield* Effect.yieldNow;
      inspect();
      return value;
    });

    const module = {
      storage: {
        layer: (configuration) => {
          expect(configuration).toEqual({
            library: { id: 1, type: 'movie', name: 'Movies' },
            settings: { directory: '/library' },
          });
          inspect();
          return Layer.fromBuild(() => {
            inspect();
            return Effect.sync(() => {
              inspect();
              return Context.make(
                StoragePlugin,
                StoragePlugin.of({
                  decodeRootLocation: (input) => {
                    expect(input).toEqual({ location: '/library' });
                    inspect();
                    return execute({ value: StorageRootLocation.make(input.location) });
                  },
                  decodeMediaFileLocation: (input) => {
                    expect(input).toEqual({ location: '/library/file' });
                    inspect();
                    return execute({
                      value: StorageMediaFileLocation.make(input.location),
                    });
                  },
                })
              );
            });
          });
        },
        layerSettings: (configuration) => {
          expect(configuration).toEqual({
            library: { _tag: 'Existing', id: 1, type: 'movie', name: 'Movies' },
          });
          inspect();
          return Layer.fromBuild(() => {
            inspect();
            return Effect.sync(() => {
              inspect();
              return Context.make(
                StoragePluginSettings,
                StoragePluginSettings.of({
                  getForm: (input) => {
                    expect(input).toEqual({ current: Option.some({ directory: '/previous' }) });
                    inspect();
                    return execute({ value: [] });
                  },
                  decodeFormSubmission: (input) => {
                    expect(input).toEqual({
                      current: Option.some({ directory: '/previous' }),
                      input: { directory: '/submitted' },
                    });
                    inspect();
                    return execute({ value: request.settings });
                  },
                })
              );
            });
          });
        },
      },
    } satisfies StoragePluginModule;

    yield* Effect.gen(function* () {
      const privateService = yield* PrivateService;
      expect(privateService).toBe('host-private');
      const stores = yield* StoragePluginMap;
      const storage = yield* stores.acquire(storageRequest);
      const editors = yield* StoragePluginSettingsMap;
      const settings = yield* editors.acquire({
        storagePlugin: settingsRequest.storagePlugin,
        library: { _tag: 'Existing', ...settingsRequest.library },
      });

      yield* Effect.gen(function* () {
        const privateService2 = yield* PrivateService;
        expect(privateService2).toBe('caller-private');
        const decodeRootLocationResult = yield* storage.decodeRootLocation(inputs.root);
        expect(decodeRootLocationResult).toBe('/library');
        const decodeMediaFileLocationResult = yield* storage.decodeMediaFileLocation(inputs.file);
        expect(decodeMediaFileLocationResult).toBe('/library/file');
        const getFormResult = yield* settings.getForm(inputs.form);
        expect(getFormResult).toEqual([]);
        const decodeFormSubmissionResult = yield* settings.decodeFormSubmission(inputs.submission);
        expect(decodeFormSubmissionResult).toEqual({
          directory: '/library',
        });
      }).pipe(Effect.provideService(PrivateService, 'caller-private'));
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
      Effect.provideService(StoragePluginModuleMap, {
        get: () => Effect.die('Request-local module resolvers must not be used'),
      }),
      Effect.provide(makeMaps(module)),
      Effect.provideService(PrivateService, 'host-private'),
      Effect.provideService(ConfigProvider.ConfigProvider, provider)
    );
  })
);

it.effect(
  'uses invocation metadata without retaining map or first-request metadata',
  Effect.fnUntraced(function* () {
    const observed: Array<Effect.Success<typeof snapshotMetadata>> = [];
    const observe = snapshotMetadata.pipe(
      Effect.tap((value) => Effect.sync(() => observed.push(value)))
    );
    const defaults = yield* snapshotMetadata.pipe(Effect.setContext(Context.empty()));
    const caller = yield* snapshotMetadata;
    const module = {
      storage: {
        layer: () =>
          Layer.effect(
            StoragePlugin,
            observe.pipe(
              Effect.as(
                StoragePlugin.of({
                  decodeRootLocation: ({ location }) =>
                    observe.pipe(Effect.as(StorageRootLocation.make(location))),
                  decodeMediaFileLocation: ({ location }) =>
                    Effect.succeed(StorageMediaFileLocation.make(location)),
                })
              )
            )
          ),
        layerSettings: () => settingsLayer,
      },
    } satisfies StoragePluginModule;

    yield* Effect.gen(function* () {
      const storage = yield* Effect.gen(function* () {
        const stores = yield* StoragePluginMap;
        const value = yield* stores.acquire(storageRequest);
        yield* value.decodeRootLocation({ location: '/first' });
        return value;
      }).pipe(
        Effect.annotateLogs({ request: 'first' }),
        Effect.provideService(References.CurrentLogSpans, [['first', 1]]),
        Effect.provideService(References.CurrentLogLevel, 'Warn')
      );
      yield* storage
        .decodeRootLocation({ location: '/second' })
        .pipe(
          Effect.annotateLogs({ request: 'second' }),
          Effect.provideService(References.CurrentLogSpans, [['second', 2]]),
          Effect.provideService(References.CurrentLogLevel, 'Debug')
        );
      yield* storage.decodeRootLocation({ location: '/unannotated' });
      const snapshotMetadata2 = yield* snapshotMetadata;
      expect(snapshotMetadata2).toEqual(caller);
    }).pipe(
      Effect.provide(
        makeMaps(module).pipe(
          Layer.provide([
            Layer.succeed(References.CurrentLogAnnotations, { request: 'map-creation' }),
            Layer.succeed(References.CurrentLogSpans, [['map-creation', 0]]),
            Layer.succeed(References.CurrentLogLevel, 'Fatal'),
          ])
        )
      )
    );

    expect(observed).toEqual([
      defaults,
      {
        annotations: { ...caller.annotations, request: 'first' },
        spans: [['first', 1]],
        level: 'Warn',
      },
      {
        annotations: { ...caller.annotations, request: 'second' },
        spans: [['second', 2]],
        level: 'Debug',
      },
      caller,
    ]);
  })
);

it.effect(
  'keeps overlapping settings invocations isolated across suspension',
  Effect.fnUntraced(function* () {
    const bothEntered = yield* Latch.make();
    const resume = yield* Latch.make();
    const observed: Array<Effect.Success<typeof snapshotContext>> = [];
    let arrivals = 0;
    const module = {
      storage: {
        layer: () => storageLayer,
        layerSettings: () =>
          Layer.succeed(
            StoragePluginSettings,
            StoragePluginSettings.of({
              getForm: Effect.fnUntraced(function* () {
                const snapshotContext2 = yield* snapshotContext;
                observed.push(snapshotContext2);
                arrivals += 1;
                if (arrivals === 2) {
                  yield* bothEntered.open;
                }
                yield* resume.await;
                const snapshotContext3 = yield* snapshotContext;
                observed.push(snapshotContext3);
                return [];
              }),
              decodeFormSubmission: () => Effect.succeed(request.settings),
            })
          ),
      },
    } satisfies StoragePluginModule;
    const caller = yield* snapshotMetadata;
    const first = {
      annotations: { ...caller.annotations, request: 'first' },
      spans: [['first', 1]],
      level: 'Warn',
    } satisfies Effect.Success<typeof snapshotMetadata>;
    const second = {
      annotations: { ...caller.annotations, request: 'second' },
      spans: [['second', 2]],
      level: 'Debug',
    } satisfies Effect.Success<typeof snapshotMetadata>;

    yield* Effect.gen(function* () {
      const editors = yield* StoragePluginSettingsMap;
      const settings = yield* editors.acquire({
        storagePlugin: settingsRequest.storagePlugin,
        library: { _tag: 'Existing', ...settingsRequest.library },
      });
      const invoke = Effect.fnUntraced(
        function* (_input: {
          readonly metadata: Effect.Success<typeof snapshotMetadata>;
          readonly privateValue: string;
        }) {
          const before = yield* snapshotContext;
          yield* settings.getForm({ current: Option.none() });
          const snapshotContext4 = yield* snapshotContext;
          expect(snapshotContext4).toEqual(before);
        },
        (effect, { metadata, privateValue }) =>
          effect.pipe(
            Effect.provideService(References.CurrentLogAnnotations, metadata.annotations),
            Effect.provideService(References.CurrentLogSpans, metadata.spans),
            Effect.provideService(References.CurrentLogLevel, metadata.level),
            Effect.provideService(PrivateService, privateValue)
          )
      );
      const firstFiber = yield* Effect.forkChild(
        invoke({ metadata: first, privateValue: 'first-private' })
      );
      const secondFiber = yield* Effect.forkChild(
        invoke({ metadata: second, privateValue: 'second-private' })
      );
      yield* bothEntered.await;
      expect(observed).toHaveLength(2);
      yield* resume.open;
      yield* Fiber.join(firstFiber);
      yield* Fiber.join(secondFiber);
    }).pipe(
      Effect.provide(makeMaps(module)),
      Effect.provideService(PrivateService, 'host-private'),
      Effect.annotateLogs({ request: 'host' })
    );

    expect(observed).toHaveLength(4);
    for (const metadata of [first, second]) {
      const expected = { metadata, services: noPrivateServices };
      expect(
        Array.filter(
          observed,
          (value) => value.metadata.annotations['request'] === metadata.annotations.request
        )
      ).toEqual([expected, expected]);
    }
  })
);

it.effect.each(['storage', 'settings'] as const)(
  'isolates cleanup when the map shuts down during %s construction',
  Effect.fnUntraced(function* (plugin) {
    const started = yield* Latch.make();
    const defaults = yield* snapshotMetadata.pipe(Effect.setContext(Context.empty()));
    const released: Array<{
      readonly kind: string;
      readonly context: Effect.Success<typeof snapshotContext>;
    }> = [];
    const release = Effect.fnUntraced(function* (kind: string) {
      released.push({ kind, context: yield* snapshotContext });
    });
    const construction = Effect.gen(function* () {
      yield* Effect.acquireRelease(Effect.void, () => release('acquireRelease'));
      const scope2 = yield* Effect.scope;
      yield* Scope.addFinalizer(scope2, release('scopeFinalizer'));
      yield* started.open;
      return yield* Effect.never;
    });
    const module = {
      storage: {
        layer: () => Layer.effect(StoragePlugin, construction),
        layerSettings: () => Layer.effect(StoragePluginSettings, construction),
      },
    } satisfies StoragePluginModule;
    const owner = yield* Effect.acquireRelease(Scope.make(), (scope) =>
      Scope.close(scope, Exit.void)
    );
    const maps = yield* Layer.buildWithScope(makeMaps(module), owner).pipe(
      Effect.provideService(PrivateService, 'host-private'),
      Effect.annotateLogs({ request: 'host' })
    );
    const pending = yield* Effect.gen(function* () {
      const stores = yield* StoragePluginMap;
      const editors = yield* StoragePluginSettingsMap;
      yield* plugin === 'storage'
        ? stores.contextEffect(storageRequest)
        : editors.contextEffect(settingsRequest);
      expect.unreachable('Construction must remain pending until map shutdown');
    }).pipe(
      Effect.scoped,
      Effect.provide(maps),
      Effect.provideService(PrivateService, 'caller-private'),
      Effect.annotateLogs({ request: 'acquisition' }),
      Effect.forkChild
    );
    yield* started.await;
    expect(released).toEqual([]);

    yield* Scope.close(owner, Exit.void).pipe(
      Effect.provideService(PrivateService, 'shutdown-private'),
      Effect.annotateLogs({ request: 'shutdown' })
    );
    const pendingExit = yield* Fiber.await(pending);
    expect(Exit.hasInterrupts(pendingExit)).toBe(true);
    expect(released).toHaveLength(2);
    expect(released).toEqual(
      expect.arrayContaining([
        { kind: 'scopeFinalizer', context: { metadata: defaults, services: noPrivateServices } },
        { kind: 'acquireRelease', context: { metadata: defaults, services: noPrivateServices } },
      ])
    );
  })
);

it.effect.each(['typed failure', 'synchronous throw'] as const)(
  'preserves a method %s and restores the caller context',
  Effect.fnUntraced(function* (outcome) {
    const error = StoragePluginSettingsError.make({ message: 'settings unavailable' });
    const defect = new Error('synchronous plugin defect');
    const module = {
      storage: {
        layer: () => storageLayer,
        layerSettings: () =>
          Layer.succeed(
            StoragePluginSettings,
            StoragePluginSettings.of({
              getForm: () => {
                if (outcome === 'synchronous throw') {
                  throw defect;
                }
                return error;
              },
              decodeFormSubmission: () => Effect.succeed(request.settings),
            })
          ),
      },
    } satisfies StoragePluginModule;

    yield* Effect.gen(function* () {
      const editors = yield* StoragePluginSettingsMap;
      const settings = yield* editors.acquire({
        storagePlugin: settingsRequest.storagePlugin,
        library: { _tag: 'Existing', ...settingsRequest.library },
      });
      yield* Effect.gen(function* () {
        const before = yield* Effect.context();
        const operation = settings.getForm({ current: Option.none() });
        const exit = yield* Effect.exit(operation);
        expect(exit).toEqual(outcome === 'typed failure' ? Exit.fail(error) : Exit.die(defect));
        const services = yield* Effect.context();
        expect(services).toBe(before);
        const privateService = yield* PrivateService;
        expect(privateService).toBe('caller-private');
      }).pipe(
        Effect.provideService(PrivateService, 'caller-private'),
        Effect.annotateLogs({ request: 'caller' }),
        Effect.provideService(References.CurrentLogSpans, [['caller', 1]]),
        Effect.provideService(References.CurrentLogLevel, 'Warn')
      );
    }).pipe(
      Effect.provide(makeMaps(module)),
      Effect.provideService(PrivateService, 'host-private')
    );
  })
);

it.effect.each(['successful', 'failed'] as const)(
  'isolates resource cleanup after %s construction',
  Effect.fnUntraced(function* (outcome) {
    let acquisitions = 0;
    const defaults = yield* snapshotMetadata.pipe(Effect.setContext(Context.empty()));
    const released: Array<string> = [];
    const release = Effect.fnUntraced(function* (kind: string) {
      const snapshotContext2 = yield* snapshotContext;
      expect(snapshotContext2).toEqual({
        metadata: defaults,
        services: noPrivateServices,
      });
      released.push(kind);
    });
    const resources = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            acquisitions += 1;
          }),
          () => release('acquireRelease')
        );
        yield* Effect.addFinalizer(() => release('addFinalizer'));
        const scope = yield* Effect.scope;
        yield* Scope.addFinalizer(scope, release('scopeFinalizer'));
      })
    );
    const storageError = StoragePluginConstructionError.make({ message: 'storage failed' });
    const settingsError = StoragePluginSettingsConstructionError.make({
      message: 'settings failed',
    });
    const module = {
      storage: {
        layer: () =>
          (outcome === 'successful'
            ? storageLayer
            : Layer.effect(StoragePlugin, storageError)
          ).pipe(Layer.provide(resources)),
        layerSettings: () =>
          (outcome === 'successful'
            ? settingsLayer
            : Layer.effect(StoragePluginSettings, settingsError)
          ).pipe(Layer.provide(resources)),
      },
    } satisfies StoragePluginModule;

    yield* Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const stores = yield* StoragePluginMap;
        const editors = yield* StoragePluginSettingsMap;
        const storage = yield* stores.contextEffect(storageRequest).pipe(Effect.exit);
        const settings = yield* editors.contextEffect(settingsRequest).pipe(Effect.exit);
        if (outcome === 'failed') {
          expect(storage).toEqual(Exit.fail(storageError));
          expect(settings).toEqual(Exit.fail(settingsError));
          expect(released).toHaveLength(6);
        } else {
          const storage2 = yield* storage;
          const plugin = Context.get(storage2, StoragePlugin);
          const settings2 = yield* settings;
          const editor = Context.get(settings2, StoragePluginSettings);
          const decodeRootLocationResult = yield* plugin.decodeRootLocation({
            location: '/constructed',
          });
          expect(decodeRootLocationResult).toBe('/constructed');
          const decodeFormSubmissionResult = yield* editor.decodeFormSubmission({
            current: Option.none(),
            input: StoragePluginSettingsInput.make({}),
          });
          expect(decodeFormSubmissionResult).toEqual({ directory: '/library' });
        }
        expect(acquisitions).toBe(2);
      }).pipe(Effect.scoped, Effect.annotateLogs({ request: 'acquisition' }));
      expect(released).toHaveLength(outcome === 'successful' ? 0 : 6);
    }).pipe(
      Effect.provide(makeMaps(module)),
      Effect.provideService(PrivateService, 'host-private'),
      Effect.annotateLogs({ request: 'host' })
    );

    expect(Array.sort(released, Order.String)).toEqual([
      'acquireRelease',
      'acquireRelease',
      'addFinalizer',
      'addFinalizer',
      'scopeFinalizer',
      'scopeFinalizer',
    ]);
  })
);
