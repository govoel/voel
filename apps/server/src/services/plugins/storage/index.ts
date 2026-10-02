import { BunChildProcessSpawner, BunFileSystem, BunPath } from '@effect/platform-bun';
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
  Cache,
  Clock,
  ConfigProvider,
  Context,
  Effect,
  Exit,
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
  SchemaParser,
  Scope,
} from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/unstable/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import type { Library } from '@repo/spec-api/database/schema.ts';
import { NpmStoragePluginId, StoragePluginLoadError } from '@repo/spec-api/plugins/storage.ts';
import { resolveSync } from 'bun';

import local from '#src/services/plugins/storage/local/index.ts';

/** Only invocation-local diagnostics may cross from a caller into a plugin. */
const pickInvocationContext = Context.pick(
  References.CurrentLogLevel,
  References.CurrentLogAnnotations,
  References.CurrentLogSpans
);

class PluginModuleExport extends Schema.Struct({
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

/**
 * Resolve shared modules, retaining npm installations until this service closes.
 * Compiled hosts need --compile-autoload-package-json for installed dependencies' exports.
 */
export class StoragePluginModuleMap extends Context.Service<StoragePluginModuleMap>()(
  '@repo/server/services/plugins/storage/StoragePluginModuleMap',
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const scope = yield* Scope.Scope;

      // The cache must not capture host services and expose them during module import.
      const modules = yield* Cache.makeWith(
        (plugin: Library['storagePlugin']) =>
          Match.value(plugin).pipe(
            Match.when('builtin:local', () => Effect.succeed<StoragePluginModule>(local)),
            Match.when(
              Schema.is(NpmStoragePluginId),
              Effect.fnUntraced(
                function* () {
                  // Modules may load files lazily: retain installations for the resolver's lifetime.
                  const directory = yield* fs
                    .makeTempDirectoryScoped({ prefix: 'voel-storage-plugin-' })
                    .pipe(Effect.provideService(Scope.Scope, scope));

                  const exitCode = yield* spawner.exitCode(
                    ChildProcess.make(
                      process.execPath,
                      ['add', '--ignore-scripts', '--', `plugin@${plugin}`],
                      {
                        cwd: directory,
                        env: { BUN_BE_BUN: '1' },
                        extendEnv: true,
                        stdin: 'ignore',
                        stdout: 'ignore',
                        stderr: 'inherit',
                      }
                    )
                  );
                  if (exitCode !== 0) {
                    return yield* StoragePluginLoadError.make({
                      message: 'Failed to install or load storage plugin',
                    });
                  }

                  const imported = yield* Effect.tryPromise(
                    async (): Promise<unknown> => import(resolveSync('plugin/index', directory))
                  );
                  return yield* PluginModuleExport.decodeUnknownEffect(imported).pipe(
                    Effect.map((module) => module.default)
                  );
                },
                Effect.catchTags({
                  PlatformError: () =>
                    Effect.fail(
                      StoragePluginLoadError.make({
                        message: 'Failed to install or load storage plugin',
                      })
                    ),
                  UnknownError: () =>
                    Effect.fail(
                      StoragePluginLoadError.make({
                        message: 'Failed to install or load storage plugin',
                      })
                    ),
                  SchemaError: () =>
                    Effect.fail(
                      StoragePluginLoadError.make({
                        message: 'Failed to install or load storage plugin',
                      })
                    ),
                })
              )
            ),
            Match.exhaustive
          ),
        {
          capacity: Infinity,
          timeToLive: (exit) => (Exit.isSuccess(exit) ? Infinity : 0),
        }
      ).pipe(Effect.setContext(Context.empty()));

      return { get: (plugin: Library['storagePlugin']) => Cache.get(modules, plugin) };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(BunChildProcessSpawner.layer),
    Layer.provide([BunFileSystem.layer, BunPath.layer])
  );
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

/** Editors for persisted libraries are keyed by their complete library context. */
export class StoragePluginSettingsMap extends LayerMap.Service<StoragePluginSettingsMap>()(
  '@repo/server/services/plugins/storage/StoragePluginSettingsMap',
  {
    idleTimeToLive: '5 minutes',
    dependencies: [StoragePluginBuilder.layer],

    lookup: (
      request: Parameters<StoragePluginModule['storage']['layerSettings']>[0] & {
        readonly storagePlugin: Library['storagePlugin'];
      }
    ) =>
      Layer.effect(
        StoragePluginSettings,
        Effect.gen(function* () {
          const buildPlugin = yield* StoragePluginBuilder;
          const { context, invoke } = yield* buildPlugin({
            storagePlugin: request.storagePlugin,
            makeLayer: (module) => module.storage.layerSettings({ library: request.library }),
          });

          const settings = Context.get(context, StoragePluginSettings);
          // Enforce the shared output contract once, inside the isolated plugin invocation.
          return StoragePluginSettings.of({
            getForm: (input) =>
              invoke(() =>
                settings
                  .getForm(input)
                  .pipe(Effect.flatMap(Schema.decodeUnknownEffect(StoragePluginSettingsForm)))
              ),
            decodeFormSubmission: (input) =>
              invoke(() =>
                settings
                  .decodeFormSubmission(input)
                  .pipe(Effect.flatMap(Schema.decodeUnknownEffect(StoragePluginSettingsPersisted)))
              ),
          });
        })
      ),
  }
) {}

/** Storage instances are keyed by their complete library context, plugin, and settings. */
export class StoragePluginMap extends LayerMap.Service<StoragePluginMap>()(
  '@repo/server/services/plugins/storage/StoragePluginMap',
  {
    idleTimeToLive: '5 minutes',
    dependencies: [StoragePluginBuilder.layer],

    lookup: (
      request: Parameters<StoragePluginModule['storage']['layer']>[0] & {
        readonly storagePlugin: Library['storagePlugin'];
      }
    ) =>
      Layer.effect(
        StoragePlugin,
        Effect.gen(function* () {
          const buildPlugin = yield* StoragePluginBuilder;
          const { context, invoke } = yield* buildPlugin({
            storagePlugin: request.storagePlugin,
            makeLayer: (module) =>
              module.storage.layer({ library: request.library, settings: request.settings }),
          });

          const storage = Context.get(context, StoragePlugin);
          return StoragePlugin.of({
            decodeRootLocation: (input) =>
              invoke(() =>
                storage
                  .decodeRootLocation(input)
                  .pipe(Effect.flatMap(SchemaParser.decodeUnknownEffect(StorageRootLocation)))
              ),
            decodeMediaFileLocation: (input) =>
              invoke(() =>
                storage
                  .decodeMediaFileLocation(input)
                  .pipe(Effect.flatMap(SchemaParser.decodeUnknownEffect(StorageMediaFileLocation)))
              ),
          });
        })
      ),
  }
) {}
