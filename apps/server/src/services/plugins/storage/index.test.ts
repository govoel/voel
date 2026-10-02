/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { Library } from '@govoel/plugins/library';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginSettings,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsError,
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import {
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
  Path,
  References,
  Scope,
} from 'effect';
import { HttpClient } from 'effect/unstable/http';

import { StoragePluginId } from '@repo/spec-api/plugins/storage.ts';

import {
  StoragePluginBuilder,
  StoragePluginMap,
  StoragePluginModuleMap,
  StoragePluginSettingsMap,
} from '#src/services/plugins/storage/index.ts';

class PrivateService extends Context.Service<PrivateService>()(
  '@repo/server/services/plugins/storage/index.test/PrivateService',
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

const storageLayer = Layer.succeed(StoragePlugin, {
  decodeRootLocation: ({ location }) => Effect.succeed(StorageRootLocation.make(location)),
  decodeMediaFileLocation: ({ location }) =>
    Effect.succeed(StorageMediaFileLocation.make(location)),
});

const settingsLayer = Layer.succeed(StoragePluginSettings, {
  getForm: () => Effect.succeed([]),
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
    builder: Effect.serviceOption(StoragePluginBuilder),
  }),
});

const noPrivateServices = {
  privateService: Option.none(),
  moduleMap: Option.none(),
  builder: Option.none(),
};

const makeMaps = (module: StoragePluginModule) =>
  Layer.mergeAll(StoragePluginMap.layerNoDeps, StoragePluginSettingsMap.layerNoDeps).pipe(
    Layer.provide(StoragePluginBuilder.layerNoDeps),
    Layer.provide([
      FileSystem.layerNoop({}),
      Path.layer,
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die('Unexpected HTTP request'))
      ),
      Layer.succeed(StoragePluginModuleMap, {
        get: (plugin) =>
          Effect.sync(() => {
            expect(plugin).toBe(request.storagePlugin);
            return module;
          }),
      }),
    ])
  );

it.effect('isolates the plugin lifecycle and forwards factory and method inputs', () =>
  Effect.gen(function* () {
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
    const inspected: Array<string> = [];
    const inspect = ({ stage, name }: { readonly stage: string; readonly name: string }) => {
      // Inspect synchronous plugin code too, not just the Effects it returns.
      const context = Fiber.getCurrent()?.context ?? Context.empty();
      expect(Context.getOption(context, PrivateService)).toEqual(Option.none());
      expect(Context.getOption(context, StoragePluginModuleMap)).toEqual(Option.none());
      expect(Context.getOption(context, StoragePluginBuilder)).toEqual(Option.none());
      expect(Option.isSome(Context.getOption(context, FileSystem.FileSystem))).toBe(true);
      expect(Option.isSome(Context.getOption(context, Path.Path))).toBe(true);
      expect(Option.isSome(Context.getOption(context, HttpClient.HttpClient))).toBe(true);
      expect(Context.get(context, ConfigProvider.ConfigProvider)).toBe(provider);
      expect(Context.get(context, Clock.Clock)).toBe(clock);
      inspected.push(`${stage}:${name}`);
    };
    const execute = <A>({ name, value }: { readonly name: string; readonly value: A }) =>
      Effect.gen(function* () {
        inspect({ stage: 'execution', name });
        yield* Effect.yieldNow;
        inspect({ stage: 'resumed', name });
        return value;
      });

    const module = {
      storage: {
        layer: (configuration) => {
          expect(configuration).toEqual({ library: request.library, settings: request.settings });
          inspect({ stage: 'factory', name: 'storage' });
          return Layer.effect(
            StoragePlugin,
            Effect.sync(() => {
              inspect({ stage: 'construction', name: 'storage' });
              return StoragePlugin.of({
                decodeRootLocation: (input) => {
                  expect(input).toBe(inputs.root);
                  inspect({ stage: 'methods', name: 'root' });
                  return execute({ name: 'root', value: StorageRootLocation.make(input.location) });
                },
                decodeMediaFileLocation: (input) => {
                  expect(input).toBe(inputs.file);
                  inspect({ stage: 'methods', name: 'file' });
                  return execute({
                    name: 'file',
                    value: StorageMediaFileLocation.make(input.location),
                  });
                },
              });
            })
          );
        },
        layerSettings: (configuration) => {
          expect(configuration).toEqual({ library: request.library });
          inspect({ stage: 'factory', name: 'settings' });
          return Layer.effect(
            StoragePluginSettings,
            Effect.sync(() => {
              inspect({ stage: 'construction', name: 'settings' });
              return StoragePluginSettings.of({
                getForm: (input) => {
                  expect(input).toBe(inputs.form);
                  inspect({ stage: 'methods', name: 'form' });
                  return execute({ name: 'form', value: [] });
                },
                decodeFormSubmission: (input) => {
                  expect(input).toBe(inputs.submission);
                  inspect({ stage: 'methods', name: 'submission' });
                  return execute({ name: 'submission', value: request.settings });
                },
              });
            })
          );
        },
      },
    } satisfies StoragePluginModule;

    yield* Effect.gen(function* () {
      expect(yield* PrivateService).toBe('host-private');
      const storage = Context.get(yield* StoragePluginMap.contextEffect(request), StoragePlugin);
      const settings = Context.get(
        yield* StoragePluginSettingsMap.contextEffect(request),
        StoragePluginSettings
      );

      yield* Effect.gen(function* () {
        expect(yield* PrivateService).toBe('caller-private');
        expect(yield* storage.decodeRootLocation(inputs.root)).toBe('/library');
        expect(yield* storage.decodeMediaFileLocation(inputs.file)).toBe('/library/file');
        expect(yield* settings.getForm(inputs.form)).toEqual([]);
        expect(yield* settings.decodeFormSubmission(inputs.submission)).toEqual(request.settings);
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

    expect(inspected).toEqual([
      'factory:storage',
      'construction:storage',
      'factory:settings',
      'construction:settings',
      ...['root', 'file', 'form', 'submission'].flatMap((name) => [
        `methods:${name}`,
        `execution:${name}`,
        `resumed:${name}`,
      ]),
    ]);
  })
);

it.effect('uses invocation metadata without retaining map or first-request metadata', () =>
  Effect.gen(function* () {
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
        const services = yield* StoragePluginMap.contextEffect(request);
        const value = Context.get(services, StoragePlugin);
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
      expect(yield* snapshotMetadata).toEqual(caller);
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

it.effect('keeps overlapping settings invocations isolated across suspension', () =>
  Effect.gen(function* () {
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
              getForm: () =>
                Effect.gen(function* () {
                  observed.push(yield* snapshotContext);
                  arrivals += 1;
                  if (arrivals === 2) {
                    yield* bothEntered.open;
                  }
                  yield* resume.await;
                  observed.push(yield* snapshotContext);
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
      const settings = Context.get(
        yield* StoragePluginSettingsMap.contextEffect(request),
        StoragePluginSettings
      );
      const invoke = ({
        metadata,
        privateValue,
      }: {
        readonly metadata: Effect.Success<typeof snapshotMetadata>;
        readonly privateValue: string;
      }) =>
        Effect.gen(function* () {
          const before = yield* snapshotContext;
          yield* settings.getForm({ current: Option.none() });
          expect(yield* snapshotContext).toEqual(before);
        }).pipe(
          Effect.provideService(References.CurrentLogAnnotations, metadata.annotations),
          Effect.provideService(References.CurrentLogSpans, metadata.spans),
          Effect.provideService(References.CurrentLogLevel, metadata.level),
          Effect.provideService(PrivateService, privateValue)
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
        observed.filter(
          (value) => value.metadata.annotations['request'] === metadata.annotations.request
        )
      ).toEqual([expected, expected]);
    }
  })
);

it.effect.each(['storage', 'settings'] as const)(
  'isolates cleanup when the map shuts down during %s construction',
  (plugin) =>
    Effect.gen(function* () {
      const started = yield* Latch.make();
      const defaults = yield* snapshotMetadata.pipe(Effect.setContext(Context.empty()));
      const released: Array<{
        readonly kind: string;
        readonly context: Effect.Success<typeof snapshotContext>;
      }> = [];
      const release = (kind: string) =>
        Effect.gen(function* () {
          released.push({ kind, context: yield* snapshotContext });
        });
      const construction = Effect.gen(function* () {
        yield* Effect.acquireRelease(Effect.void, () => release('acquireRelease'));
        yield* Scope.addFinalizer(yield* Effect.scope, release('scopeFinalizer'));
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
        yield* plugin === 'storage'
          ? StoragePluginMap.contextEffect(request)
          : StoragePluginSettingsMap.contextEffect(request);
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

      // The cache owns construction; shutting down its scope must cancel the lookup.
      yield* Scope.close(owner, Exit.void).pipe(
        Effect.provideService(PrivateService, 'shutdown-private'),
        Effect.annotateLogs({ request: 'shutdown' })
      );
      expect(Exit.hasInterrupts(yield* Fiber.await(pending))).toBe(true);
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
  (outcome) =>
    Effect.gen(function* () {
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
                  return Effect.fail(error);
                },
                decodeFormSubmission: () => Effect.succeed(request.settings),
              })
            ),
        },
      } satisfies StoragePluginModule;

      yield* Effect.gen(function* () {
        const settings = Context.get(
          yield* StoragePluginSettingsMap.contextEffect(request),
          StoragePluginSettings
        );
        yield* Effect.gen(function* () {
          const before = yield* Effect.context();
          // Calling the method itself must not throw; its returned Effect owns the defect.
          const operation = settings.getForm({ current: Option.none() });
          const exit = yield* Effect.exit(operation);
          expect(exit).toEqual(outcome === 'typed failure' ? Exit.fail(error) : Exit.die(defect));
          expect(yield* Effect.context()).toBe(before);
          expect(yield* PrivateService).toBe('caller-private');
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
  (outcome) =>
    Effect.gen(function* () {
      let acquisitions = 0;
      const defaults = yield* snapshotMetadata.pipe(Effect.setContext(Context.empty()));
      const released: Array<string> = [];
      const release = (kind: string) =>
        Effect.gen(function* () {
          expect(yield* snapshotContext).toEqual({
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
          yield* Scope.addFinalizer(yield* Effect.scope, release('scopeFinalizer'));
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
              : Layer.effect(StoragePlugin, Effect.fail(storageError))
            ).pipe(Layer.provide(resources)),
          layerSettings: () =>
            (outcome === 'successful'
              ? settingsLayer
              : Layer.effect(StoragePluginSettings, Effect.fail(settingsError))
            ).pipe(Layer.provide(resources)),
        },
      } satisfies StoragePluginModule;

      yield* Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const storage = yield* StoragePluginMap.contextEffect(request).pipe(Effect.exit);
          const settings = yield* StoragePluginSettingsMap.contextEffect(request).pipe(Effect.exit);
          if (outcome === 'failed') {
            expect(storage).toEqual(Exit.fail(storageError));
            expect(settings).toEqual(Exit.fail(settingsError));
            expect(released).toHaveLength(6);
          } else {
            expect(Exit.isSuccess(storage)).toBe(true);
            expect(Exit.isSuccess(settings)).toBe(true);
            expect(Context.get(yield* StoragePluginMap.contextEffect(request), StoragePlugin)).toBe(
              Context.get(yield* storage, StoragePlugin)
            );
          }
          expect(acquisitions).toBe(2);
        }).pipe(Effect.scoped, Effect.annotateLogs({ request: 'acquisition' }));
        // Successful entries must survive the caller's scope until the cache is closed.
        expect(released).toHaveLength(outcome === 'successful' ? 0 : 6);
      }).pipe(
        Effect.provide(makeMaps(module)),
        Effect.provideService(PrivateService, 'host-private'),
        Effect.annotateLogs({ request: 'host' })
      );

      expect(released.toSorted()).toEqual([
        'acquireRelease',
        'acquireRelease',
        'addFinalizer',
        'addFinalizer',
        'scopeFinalizer',
        'scopeFinalizer',
      ]);
    })
);
