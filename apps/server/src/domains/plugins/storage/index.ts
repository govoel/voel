import { BunFileSystem, BunPath } from '@effect/platform-bun';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginSettings,
  StoragePluginSettingsForm,
  StoragePluginSettingsPersisted,
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
        (value): value is StoragePluginModule['storage']['layerSettings'] => Layer.isLayer(value)
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
        get: (pluginId: Library['storagePluginId']) =>
          Match.value(pluginId).pipe(
            Match.when('builtin:local', () => Effect.succeed<StoragePluginModule>(local)),
            Match.when(NpmPluginId.is, (npmPluginId) =>
              modules.get(npmPluginId).pipe(
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
        storagePluginId,
        makeLayer,
      }: {
        readonly storagePluginId: Library['storagePluginId'];
        readonly makeLayer: (
          module: StoragePluginModule
        ) => Layer.Layer<ROut, E, FileSystem.FileSystem | Path.Path | HttpClient.HttpClient>;
      }) {
        const pluginScope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) =>
          Scope.close(scope, exit).pipe(Effect.setContext(isolatedContext))
        );

        const context = yield* Layer.buildWithScope(
          plugins.get(storagePluginId).pipe(Effect.map(makeLayer), Layer.unwrap),
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

class StoragePluginSettingsEditor extends Context.Service<StoragePluginSettingsEditor>()(
  '@repo/server/domains/plugins/storage/StoragePluginSettingsEditor',
  {
    make: Effect.fnUntraced(function* ({ storagePluginId }: Pick<Library, 'storagePluginId'>) {
      const buildPlugin = yield* StoragePluginBuilder;
      const { context, invoke } = yield* buildPlugin({
        storagePluginId,
        makeLayer: (module) => module.storage.layerSettings,
      });
      const settings = Context.get(context, StoragePluginSettings);
      return {
        getForm: ({ library, current }: Parameters<typeof settings.getForm>[0]) =>
          invoke(() =>
            settings
              .getForm({
                library: { name: library.name, type: library.type },
                current,
              })
              .pipe(
                Effect.flatMap((form) =>
                  StoragePluginSettingsForm.decodeEffect(form).pipe(
                    Effect.catchTags({ SchemaError: Effect.die })
                  )
                )
              )
          ),
        decodeFormSubmission: ({
          library,
          current,
          input,
        }: Parameters<typeof settings.decodeFormSubmission>[0]) =>
          invoke(() =>
            settings
              .decodeFormSubmission({
                library: { name: library.name, type: library.type },
                current,
                input,
              })
              .pipe(
                Effect.flatMap((persisted) =>
                  StoragePluginSettingsPersisted.decodeEffect(persisted).pipe(
                    Effect.catchTags({ SchemaError: Effect.die })
                  )
                )
              )
          ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = (request: Parameters<typeof this.make>[0]) =>
    Layer.effect(this, this.make(request));

  public static readonly layer = (request: Parameters<typeof this.make>[0]) =>
    this.layerNoDeps(request).pipe(Layer.provide(StoragePluginBuilder.layer));
}

export class StoragePluginSettingsMap extends Context.Service<StoragePluginSettingsMap>()(
  '@repo/server/domains/plugins/storage/StoragePluginSettingsMap',
  {
    make: LayerMap.make(
      (storagePluginId: Library['storagePluginId']) =>
        StoragePluginSettingsEditor.layerNoDeps({ storagePluginId }),
      { idleTimeToLive: '5 minutes' }
    ).pipe(
      Effect.map((map) => ({
        ...map,
        acquire: (storagePluginId: Library['storagePluginId']) =>
          map
            .contextEffect(storagePluginId)
            .pipe(Effect.map(Context.get(StoragePluginSettingsEditor))),
      }))
    ),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(StoragePluginBuilder.layer));
}

export class StoragePluginMap extends Context.Service<StoragePluginMap>()(
  '@repo/server/domains/plugins/storage/StoragePluginMap',
  {
    make: LayerMap.make(
      (request: StoragePluginKey) =>
        Layer.effect(
          StoragePlugin,
          Effect.gen(function* () {
            const buildPlugin = yield* StoragePluginBuilder;
            const { context, invoke } = yield* buildPlugin({
              storagePluginId: request.storagePluginId,
              makeLayer: (module) =>
                module.storage.layer({
                  library: request.library,
                  settings: request.settings,
                }),
            });

            const storage = Context.get(context, StoragePlugin);
            return StoragePlugin.of({
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
          })
        ),
      { idleTimeToLive: '5 minutes' }
    ).pipe(
      Effect.map((map) => ({
        ...map,
        acquire: (request: StoragePluginKey) =>
          map.contextEffect(request).pipe(Effect.map(Context.get(StoragePlugin))),
      }))
    ),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(StoragePluginBuilder.layer));
}
