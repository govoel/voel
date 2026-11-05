import { BunFileSystem, BunPath } from '@effect/platform-bun';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginSettings,
  StoragePluginSettingsContext,
  StoragePluginSettingsForm,
  StoragePluginSettingsLibrary,
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

import type { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';
import { StoragePluginLoadError } from '@repo/spec-api/domains/plugins/storage.ts';

import { PluginModuleMap } from '#src/domains/plugins/index.ts';
import local from '#src/domains/plugins/storage/local/index.ts';
import type { StoragePluginKey } from '#src/domains/plugins/storage/schema.ts';
import { StoragePluginSettingsKey } from '#src/domains/plugins/storage/schema.ts';

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

export class StoragePluginModuleMap extends Context.Service<StoragePluginModuleMap>()(
  '@repo/server/domains/plugins/storage/StoragePluginModuleMap',
  {
    make: Effect.gen(function* () {
      const modules = yield* PluginModuleMap;

      return {
        get: (plugin: Library['storagePlugin']) =>
          Match.value(plugin).pipe(
            Match.when('builtin:local', () => Effect.succeed<StoragePluginModule>(local)),
            Match.when(NpmPluginId.is, (npmPlugin) =>
              modules.get(npmPlugin).pipe(
                Effect.flatMap(StoragePluginModuleExport.decodeUnknownEffect),
                Effect.map((module) => module.default),
                Effect.catchTags({
                  SchemaError: () =>
                    StoragePluginLoadError.make({ message: 'Invalid storage plugin module' }),
                })
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

export class StoragePluginBuilder extends Context.Service<StoragePluginBuilder>()(
  '@repo/server/domains/plugins/storage/StoragePluginBuilder',
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
        const pluginScope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) =>
          Scope.close(scope, exit).pipe(Effect.setContext(isolatedContext))
        );

        const context = yield* Layer.buildWithScope(
          plugins.get(storagePlugin).pipe(Effect.map(makeLayer), Layer.unwrap),
          pluginScope
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

export class StoragePluginSettingsMap extends Context.Service<StoragePluginSettingsMap>()(
  '@repo/server/domains/plugins/storage/StoragePluginSettingsMap',
  {
    make: Effect.gen(function* () {
      const buildPlugin = yield* StoragePluginBuilder;
      const makeEditor = Effect.fnUntraced(function* (request: {
        readonly storagePlugin: Library['storagePlugin'];
        readonly library: typeof StoragePluginSettingsLibrary.Type;
      }) {
        const { context, invoke } = yield* buildPlugin({
          storagePlugin: request.storagePlugin,
          makeLayer: (module) => module.storage.layerSettings({ library: request.library }),
        });

        const settings = Context.get(context, StoragePluginSettings);
        return StoragePluginSettings.of({
          getForm: (input) =>
            invoke(() =>
              settings
                .getForm(input)
                .pipe(
                  Effect.flatMap((form) =>
                    StoragePluginSettingsForm.decodeEffect(form).pipe(
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
                    StoragePluginSettingsPersisted.decodeEffect(persisted).pipe(
                      Effect.catchTags({ SchemaError: Effect.die })
                    )
                  )
                )
            ),
        });
      });
      const map = yield* LayerMap.make(
        (request: StoragePluginSettingsKey) =>
          Layer.effect(
            StoragePluginSettings,
            makeEditor({
              storagePlugin: request.storagePlugin,
              library: StoragePluginSettingsContext.Existing(request.library),
            })
          ),
        { idleTimeToLive: '5 minutes' }
      );
      return {
        ...map,
        acquire: (request: {
          readonly storagePlugin: Library['storagePlugin'];
          readonly library: typeof StoragePluginSettingsLibrary.Type;
        }) =>
          StoragePluginSettingsLibrary.guards.Draft(request.library)
            ? makeEditor(request)
            : Schema.decodeEffect(StoragePluginSettingsKey)({
                storagePlugin: request.storagePlugin,
                library: request.library,
              }).pipe(
                Effect.catchTag('SchemaError', Effect.die),
                Effect.flatMap((key) => map.contextEffect(key)),
                Effect.map(Context.get(StoragePluginSettings))
              ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(StoragePluginBuilder.layer));
}

export class StoragePluginMap extends Context.Service<StoragePluginMap>()(
  '@repo/server/domains/plugins/storage/StoragePluginMap',
  {
    make: Effect.gen(function* () {
      const buildPlugin = yield* StoragePluginBuilder;
      const makeStorage = Effect.fnUntraced(function* (request: StoragePluginKey) {
        const { context, invoke } = yield* buildPlugin({
          storagePlugin: request.storagePlugin,
          makeLayer: (module) =>
            module.storage.layer({
              library: request.library,
              settings: request.settings,
            }),
        });

        const storage = Context.get(context, StoragePlugin);
        return StoragePlugin.of({
          decodeRootLocation: (input) =>
            invoke(() =>
              storage
                .decodeRootLocation(input)
                .pipe(
                  Effect.flatMap((result) =>
                    StorageRootLocation.decodeEffect(result).pipe(
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
                    StorageMediaFileLocation.decodeEffect(result).pipe(
                      Effect.catchTags({ SchemaError: Effect.die })
                    )
                  )
                )
            ),
        });
      });
      const map = yield* LayerMap.make(
        (request: StoragePluginKey) => Layer.effect(StoragePlugin, makeStorage(request)),
        { idleTimeToLive: '5 minutes' }
      );
      return {
        ...map,
        acquire: (request: StoragePluginKey) =>
          map.contextEffect(request).pipe(Effect.map(Context.get(StoragePlugin))),
        acquireScoped: makeStorage,
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(StoragePluginBuilder.layer));
}
