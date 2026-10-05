import { BunFileSystem, BunPath } from '@effect/platform-bun';
import type { StoragePluginModule, StoragePluginSettingsInput } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
  StoragePluginSettings,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Reactivity } from 'effect/reactivity';

import { Library } from '@repo/spec-api/database/schema.ts';
import { PluginLoadError } from '@repo/spec-api/plugins/index.ts';

import { ApiConfig } from '#src/services/config.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { Libraries } from '#src/services/libraries/index.ts';
import { LibraryRepository } from '#src/services/libraries/repository.ts';
import { PluginModuleMap } from '#src/services/plugins/index.ts';
import {
  StoragePluginBuilder,
  StoragePluginMap,
  StoragePluginModuleMap,
  StoragePluginSettingsMap,
} from '#src/services/plugins/storage/index.ts';

export class Input extends Schema.Struct({ root: Schema.NonEmptyString }) {}
class Persisted extends Schema.Struct({ prefix: Schema.NonEmptyString }) {}

export class PluginFixture extends Context.Service<PluginFixture>()(
  '@repo/server/services/libraries/test-fixture/PluginFixture',
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

// Construction, caches, and background retirement live for the enclosing fixture scope.
export const librariesTestLayer = Libraries.layerNoDeps.pipe(
  Layer.provideMerge(Layer.mergeAll(LibraryRepository.layerNoDeps, pluginLayer)),
  Layer.provideMerge(LibraryDatabase.layerNoDeps),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer])
);

export const createInput = (
  name: string,
  plugin: 'builtin:local' | `npm:${string}` = 'builtin:local'
) => ({
  name: Library.fields.name.make(name),
  type: Library.fields.type.make('movie'),
  storagePlugin: Library.fields.storagePlugin.make(plugin),
});
