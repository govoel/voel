import { BunFileSystem, BunPath } from '@effect/platform-bun';
import type { StoragePluginModule, StoragePluginSettingsInput } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginInvalidSettingsError,
  StoragePluginSettings,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Effect, Layer, Option, Scheduler, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { PluginLoadError } from '@repo/spec-api/domains/plugins/schema.ts';

import { PluginModuleMap } from '#src/domains/plugins/index.ts';
import {
  StoragePluginBuilder,
  StoragePluginMap,
  StoragePluginModuleMap,
  StoragePluginSettingsMap,
} from '#src/domains/plugins/storage/index.ts';

export class Input extends Schema.Struct({ root: Schema.NonEmptyString }) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);

  public static readonly is = Schema.is(this);
}

class Persisted extends Schema.Struct({ prefix: Schema.NonEmptyString }) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

// Share one dispatcher so tests can drain runnable work from every handler/cache fiber.
// Draining does not wait for promises, timers, or deliberately blocked finalizers.
export class TestScheduler extends Context.Service<TestScheduler>()(
  '@repo/server/domains/library/testing/TestScheduler',
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

export class PluginFixture extends Context.Service<PluginFixture>()(
  '@repo/server/domains/library/testing/PluginFixture',
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
                  Effect.catchTags({
                    SchemaError: () =>
                      StoragePluginConstructionError.make({ message: 'Invalid persisted settings' }),
                  })
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
                      Effect.catchTags({
                        SchemaError: (error) =>
                          StorageLocationValidationError.make({ message: error.message }),
                      })
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
                            Effect.catchTags({
                              SchemaError: () =>
                                StoragePluginSettingsError.make({
                                  message:
                                    'Storage plugin could not build the settings form from the current settings',
                                }),
                            })
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
                          Effect.catchTags({
                            SchemaError: () =>
                              StoragePluginInvalidSettingsError.make({
                                message: 'Submitted storage plugin settings failed validation',
                              }),
                          })
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

export const pluginLayer = Layer.mergeAll(
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
