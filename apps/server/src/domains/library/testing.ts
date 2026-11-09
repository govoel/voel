import { BunFileSystem, BunPath } from '@effect/platform-bun';
import type { StoragePluginModule, StoragePluginSettingsForm } from '@govoel/plugins/storage';
import {
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginInvalidSettingsError,
  StoragePluginSettings,
  StoragePluginSettingsError,
} from '@govoel/plugins/storage';
import { Context, Effect, Layer, Option, Scheduler, Schema, String } from 'effect';
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
        onFinalize: (
          _request: Parameters<StoragePluginModule['storage']['layer']>[0]
        ): Effect.Effect<void> => Effect.void,
        beforeDecode: (
          _request: Parameters<typeof StoragePluginSettings.Service.decodeFormSubmission>[0]
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
                      StoragePluginConstructionError.make({
                        message: 'Invalid persisted settings',
                      }),
                  })
                );
                if (settings.prefix === 'unavailable' || request.library.name === 'Rejected') {
                  return yield* StoragePluginConstructionError.make({
                    message: 'Storage unavailable',
                  });
                }
                activeStorage.add(request);
                return StoragePlugin.of({
                  decodeMediaFileLocation: ({ location }) =>
                    Effect.succeed(StorageMediaFileLocation.make(location)),
                });
              })
            ),
          layerSettings: Layer.effect(
            StoragePluginSettings,
            Effect.sync(() =>
              StoragePluginSettings.of({
                getForm: Effect.fnUntraced(function* ({ library, current }) {
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
                    kind: 'TextField',
                    purpose: 'text',
                    name: 'root',
                    label: library.name,
                    placeholder: '',
                    initialValue: settings.prefix,
                  } satisfies (typeof StoragePluginSettingsForm.Encoded)[number];
                  return controls.invalidForm ? [field, field] : [field];
                }),
                decodeFormSubmission: (request) =>
                  controls.beforeDecode(request).pipe(
                    Effect.andThen(() =>
                      controls.settingsError
                        ? StoragePluginSettingsError.make({ message: 'Settings unavailable' })
                        : Effect.void
                    ),
                    Effect.andThen(
                      Input.decodeUnknownEffect(request.input).pipe(
                        Effect.catchTags({
                          SchemaError: () =>
                            StoragePluginInvalidSettingsError.make({
                              message: 'Submitted storage plugin settings failed validation',
                            }),
                        })
                      )
                    ),
                    Effect.map(({ root }) => {
                      if (controls.invalidPersisted) {
                        return { prefix: String.trim(root), version: Number.NaN };
                      }
                      return { prefix: String.trim(root) };
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
          get: (pluginId) =>
            pluginId === Library.fields.storagePluginId.make('npm:missing')
              ? PluginLoadError.make({ message: 'Plugin unavailable' })
              : Effect.succeed({ default: fixture.module }),
        };
      })
    )
  ),
  Layer.provideMerge(PluginFixture.layer),
  Layer.provide([BunFileSystem.layer, BunPath.layer, FetchHttpClient.layer])
);
