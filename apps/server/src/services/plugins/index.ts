import { BunChildProcessSpawner, BunFileSystem, BunPath } from '@effect/platform-bun';
import { Cache, Context, Effect, Exit, FileSystem, Layer, Scope } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import type { NpmPluginId } from '@repo/spec-api/plugins/index.ts';
import { PluginLoadError } from '@repo/spec-api/plugins/index.ts';

import { BunModuleResolverLayer } from '#src/services/module-resolver/bun.ts';
import { ModuleResolver } from '#src/services/module-resolver/index.ts';

/**
 * Cache raw npm module namespaces independently of their export contracts.
 * Installations live until this service closes so modules can load files lazily.
 * Compiled hosts need --compile-autoload-package-json for installed dependencies' exports.
 */
export class PluginModuleMap extends Context.Service<PluginModuleMap>()(
  '@repo/server/services/plugins/PluginModuleMap',
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const resolver = yield* ModuleResolver;
      const scope = yield* Scope.Scope;

      // The cache must not capture host services and expose them during module import.
      const modules = yield* Cache.makeWith(
        Effect.fnUntraced(
          function* (plugin: typeof NpmPluginId.Type) {
            const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'voel-plugin-' });

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
              return yield* PluginLoadError.make({ message: 'Failed to install or load plugin' });
            }

            const resolved = yield* resolver.resolve({ specifier: 'plugin/index', directory });
            return yield* Effect.tryPromise({
              try: async (): Promise<unknown> => import(resolved),
              catch: () => PluginLoadError.make({ message: 'Failed to install or load plugin' }),
            });
          },
          // Failed attempts close and detach immediately; successful installs live with the map.
          (effect) =>
            Effect.acquireUseRelease(
              Scope.fork(scope),
              (attemptScope) => effect.pipe(Scope.provide(attemptScope)),
              (attemptScope, exit) =>
                Exit.isFailure(exit) ? Scope.close(attemptScope, exit) : Effect.void
            ),
          // Translate loader-boundary failures without exposing installation or import details.
          Effect.catchTag(['PlatformError', 'ModuleResolutionError'], () =>
            Effect.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
          )
        ),
        {
          capacity: Infinity,
          timeToLive: (exit) => (Exit.isSuccess(exit) ? Infinity : 0),
        }
      ).pipe(Effect.setContext(Context.empty()));

      return { get: (plugin: typeof NpmPluginId.Type) => Cache.get(modules, plugin) };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(BunChildProcessSpawner.layer),
    Layer.provide([BunFileSystem.layer, BunPath.layer, BunModuleResolverLayer])
  );
}
