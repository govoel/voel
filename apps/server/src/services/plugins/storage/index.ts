import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Library as PluginLibrary } from '@govoel/plugins/library';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginSettings,
  StoragePluginSettingsForm,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import {
  Clock,
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  LayerMap,
  Logger,
  Match,
  Path,
  Predicate,
  References,
  Scheduler,
  Schema,
  Scope,
} from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';

import type { Library } from '@repo/spec-api/database/schema.ts';
import { NpmPluginId } from '@repo/spec-api/plugins/index.ts';
import { StoragePluginId, StoragePluginLoadError } from '@repo/spec-api/plugins/storage.ts';

import { PluginModuleMap } from '#src/services/plugins/index.ts';
import local from '#src/services/plugins/storage/local/index.ts';

/** Only invocation-local diagnostics may cross from a caller into a plugin. */
const pickInvocationContext = Context.pick(
  References.CurrentLogLevel,
  References.CurrentLogAnnotations,
  References.CurrentLogSpans
);

class StoragePluginModuleExport extends Schema.Struct({
  default: Schema.Struct({
    storage: Schema.Struct({
      layer: Schema.declare((value): value is StoragePluginModule['storage']['layer'] =>
        Predicate.isFunction(value)
      ),
      layerSettings: Schema.declare(
        (value): value is StoragePluginModule['storage']['layerSettings'] =>
          Predicate.isFunction(value)
      ),
    }),
  }),
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

/** Resolve built-in storage or validate a shared npm module's storage export. */
export class StoragePluginModuleMap extends Context.Service<StoragePluginModuleMap>()(
  '@repo/server/services/plugins/storage/StoragePluginModuleMap',
  {
    make: Effect.gen(function* () {
      const modules = yield* PluginModuleMap;

      return {
        get: (plugin: Library['storagePlugin']) =>
          Match.value(plugin).pipe(
            Match.when('builtin:local', () => Effect.succeed<StoragePluginModule>(local)),
            Match.when(Schema.is(NpmPluginId), (npmPlugin) =>
              modules.get(npmPlugin).pipe(
                Effect.flatMap(StoragePluginModuleExport.decodeUnknownEffect),
                Effect.map((module) => module.default),
                Effect.catchTag('SchemaError', () =>
                  Effect.fail(
                    StoragePluginLoadError.make({ message: 'Invalid storage plugin module' })
                  )
                )
              )
            ),
            Match.exhaustive
          ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(PluginModuleMap.layer));
}

/** Capture the resolver and permitted host context before requests populate either map. */
export class StoragePluginBuilder extends Context.Service<StoragePluginBuilder>()(
  '@repo/server/services/plugins/storage/StoragePluginBuilder',
  {
    make: Effect.gen(function* () {
      const plugins = yield* StoragePluginModuleMap;
      const isolatedContext = yield* Effect.context<
        FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
      >().pipe(
        Effect.map(
          Context.pick(
            FileSystem.FileSystem,
            Path.Path,
            HttpClient.HttpClient,
            ConfigProvider.ConfigProvider,
            Clock.Clock,
            Scheduler.Scheduler,
            Logger.CurrentLoggers,
            References.MinimumLogLevel
          )
        )
      );

      const invoke = <A, E>(operation: () => Effect.Effect<A, E>) =>
        Effect.suspend(operation).pipe(
          Effect.updateContext((caller: Context.Context<never>) =>
            Context.merge(isolatedContext, pickInvocationContext(caller))
          )
        );

      return Effect.fnUntraced(function* <ROut, E>({
        storagePlugin,
        makeLayer,
      }: {
        readonly storagePlugin: Library['storagePlugin'];
        readonly makeLayer: (
          module: StoragePluginModule
        ) => Layer.Layer<ROut, E, FileSystem.FileSystem | Path.Path | HttpClient.HttpClient>;
      }) {
        // The cached layer owns the lifetime, but even finalizers run without host services.
        const pluginScope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) =>
          Scope.close(scope, exit).pipe(Effect.setContext(isolatedContext))
        );

        const context = yield* Effect.suspend(() =>
          Layer.buildWithScope(
            plugins.get(storagePlugin).pipe(Effect.map(makeLayer), Layer.unwrap),
            pluginScope
          )
        ).pipe(Effect.setContext(isolatedContext));

        return { context, invoke };
      });
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([
      StoragePluginModuleMap.layer,
      BunFileSystem.layer,
      BunPath.layer,
      FetchHttpClient.layer,
    ])
  );
}

/** Canonical identities shared by acquisition, cached health, and retirement. */
class StoragePluginSettingsKey extends Schema.Class<
  StoragePluginSettingsKey,
  { readonly brand: unique symbol }
>('@repo/server/services/plugins/storage/StoragePluginSettingsKey')({
  storagePlugin: StoragePluginId,
  library: PluginLibrary,
}) {}

class StoragePluginKey extends Schema.Class<StoragePluginKey, { readonly brand: unique symbol }>(
  '@repo/server/services/plugins/storage/StoragePluginKey'
)({
  ...StoragePluginSettingsKey.fields,
  settings: StoragePluginSettingsPersisted,
}) {}

const storagePluginSettingsFormDecodeEffect = Schema.decodeEffect(StoragePluginSettingsForm);
const storagePluginSettingsPersistedDecodeEffect = Schema.decodeEffect(
  StoragePluginSettingsPersisted
);

/** Editors for persisted libraries are keyed by their plugin-visible library context. */
export class StoragePluginSettingsMap extends Context.Service<StoragePluginSettingsMap>()(
  '@repo/server/services/plugins/storage/StoragePluginSettingsMap',
  {
    make: LayerMap.make(
      (request: StoragePluginSettingsKey) =>
        Layer.effect(
          StoragePluginSettings,
          Effect.gen(function* () {
            const buildPlugin = yield* StoragePluginBuilder;
            const { context, invoke } = yield* buildPlugin({
              storagePlugin: request.storagePlugin,
              makeLayer: (module) => module.storage.layerSettings({ library: request.library }),
            });

            const settings = Context.get(context, StoragePluginSettings);
            // Malformed successful outputs violate the contract, rather than rejecting input.
            return StoragePluginSettings.of({
              getForm: (input) =>
                invoke(() =>
                  settings
                    .getForm(input)
                    .pipe(
                      Effect.flatMap((form) =>
                        storagePluginSettingsFormDecodeEffect(form).pipe(
                          Effect.catchTags({ SchemaError: Effect.die })
                        )
                      )
                    )
                ),
              decodeFormSubmission: (input) =>
                invoke(() =>
                  settings
                    .decodeFormSubmission(input)
                    .pipe(
                      Effect.flatMap((persisted) =>
                        storagePluginSettingsPersistedDecodeEffect(persisted).pipe(
                          Effect.catchTags({ SchemaError: Effect.die })
                        )
                      )
                    )
                ),
            });
          })
        ),
      { idleTimeToLive: '5 minutes' }
    ).pipe(
      Effect.map((map) => ({
        ...map,
        /** Acquire an editor in the caller's scope using its canonical identity. */
        acquire: (request: Parameters<typeof StoragePluginSettingsKey.make>[0]) =>
          map
            .contextEffect(StoragePluginSettingsKey.make(request))
            .pipe(Effect.map(Context.get(StoragePluginSettings))),
      }))
    ),
  }
) {
  public static readonly Key = StoragePluginSettingsKey;

  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(StoragePluginBuilder.layer));
}

const storageRootLocationDecodeEffect = Schema.decodeEffect(StorageRootLocation);
const storageMediaFileLocationDecodeEffect = Schema.decodeEffect(StorageMediaFileLocation);

/** Storage instances are keyed by their plugin-visible library context, plugin, and settings. */
export class StoragePluginMap extends Context.Service<StoragePluginMap>()(
  '@repo/server/services/plugins/storage/StoragePluginMap',
  {
    make: LayerMap.make(
      (request: StoragePluginKey) =>
        Layer.effect(
          StoragePlugin,
          Effect.gen(function* () {
            const buildPlugin = yield* StoragePluginBuilder;
            const { context, invoke } = yield* buildPlugin({
              storagePlugin: request.storagePlugin,
              makeLayer: (module) =>
                module.storage.layer({
                  library: request.library,
                  settings: request.settings,
                }),
            });

            const storage = Context.get(context, StoragePlugin);
            // Invalid outputs violate the plugin contract, rather than rejecting user input.
            return StoragePlugin.of({
              decodeRootLocation: (input) =>
                invoke(() =>
                  storage
                    .decodeRootLocation(input)
                    .pipe(
                      Effect.flatMap((result) =>
                        storageRootLocationDecodeEffect(result).pipe(
                          Effect.catchTags({ SchemaError: Effect.die })
                        )
                      )
                    )
                ),
              decodeMediaFileLocation: (input) =>
                invoke(() =>
                  storage
                    .decodeMediaFileLocation(input)
                    .pipe(
                      Effect.flatMap((result) =>
                        storageMediaFileLocationDecodeEffect(result).pipe(
                          Effect.catchTags({ SchemaError: Effect.die })
                        )
                      )
                    )
                ),
            });
          })
        ),
      { idleTimeToLive: '5 minutes' }
    ).pipe(
      Effect.map((map) => ({
        ...map,
        /** Acquire storage in the caller's scope using its canonical identity. */
        acquire: (request: Parameters<typeof StoragePluginKey.make>[0]) =>
          map
            .contextEffect(StoragePluginKey.make(request))
            .pipe(Effect.map(Context.get(StoragePlugin))),
      }))
    ),
  }
) {
  public static readonly Key = StoragePluginKey;

  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(StoragePluginBuilder.layer));
}
