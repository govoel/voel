/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Context, Effect, Exit, FileSystem, Layer, Option } from 'effect';
import { ChildProcessSpawner } from 'effect/unstable/process';

import { NpmPluginId, PluginLoadError } from '@repo/spec-api/plugins/index.ts';

import { BunModuleResolverLayer } from '#src/services/module-resolver/bun.ts';
import { ModuleResolutionError, ModuleResolver } from '#src/services/module-resolver/index.ts';
import { PluginModuleMap } from '#src/services/plugins/index.ts';

class PrivateService extends Context.Service<PrivateService>()(
  '@repo/server/services/plugins/index.test/PrivateService',
  { make: Effect.succeed('private') }
) {}

it.effect('shares npm installs and retains their files until the module map closes', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directories: Array<string> = [];
    const spawnerLayer = Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
      exitCode: Effect.fnUntraced(function* (
        command: Parameters<ChildProcessSpawner.ChildProcessSpawner['Service']['exitCode']>[0]
      ) {
        if (command._tag !== 'StandardCommand' || command.options.cwd === void 0) {
          return yield* Effect.die('Expected an installation directory');
        }
        expect(command.command).toBe(process.execPath);
        expect(command.args).toEqual([
          'add',
          '--ignore-scripts',
          '--',
          'plugin@npm:@fixture/plugin@^1',
        ]);
        expect(command.options.env).toEqual({ BUN_BE_BUN: '1' });
        expect(command.options.extendEnv).toBe(true);
        const directory = command.options.cwd;
        directories.push(directory);
        yield* fs.makeDirectory(`${directory}/node_modules/plugin`, { recursive: true });
        yield* fs.makeDirectory(`${directory}/node_modules/helper`, { recursive: true });
        yield* fs.writeFileString(
          `${directory}/node_modules/plugin/package.json`,
          '{"name":"@fixture/plugin","exports":{"./index":"./entry.mjs"}}'
        );
        yield* fs.writeFileString(
          `${directory}/node_modules/plugin/entry.mjs`,
          'export { default } from "helper"; export const marker = "preserved";'
        );
        yield* fs.writeFileString(
          `${directory}/node_modules/helper/index.js`,
          'module.exports = { name: "not a storage plugin" };'
        );
        return ChildProcessSpawner.ExitCode(0);
      }),
    });

    yield* Effect.gen(function* () {
      const modules = yield* PluginModuleMap;
      const plugin = NpmPluginId.make('npm:@fixture/plugin@^1');
      const [first, second] = yield* Effect.all([modules.get(plugin), modules.get(plugin)], {
        concurrency: 'unbounded',
      });
      expect(first).toBe(second);
      expect(first).toMatchObject({
        default: { name: 'not a storage plugin' },
        marker: 'preserved',
      });
      expect(yield* modules.get(plugin).pipe(Effect.scoped)).toBe(first);
      expect(directories).toHaveLength(1);
      for (const directory of directories) {
        expect(yield* fs.exists(directory)).toBe(true);
      }
    }).pipe(Effect.provide(PluginModuleMap.layerNoDeps.pipe(Layer.provide(spawnerLayer))));

    for (const directory of directories) {
      expect(yield* fs.exists(directory)).toBe(false);
    }
  }).pipe(Effect.provide([BunFileSystem.layer, BunModuleResolverLayer]))
);

it.effect('does not restore captured host services during an isolated module lookup', () =>
  Effect.gen(function* () {
    const modules = yield* PluginModuleMap.make.pipe(
      Effect.provideService(PrivateService, 'host-private'),
      Effect.provide(
        Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
          exitCode: () =>
            Effect.gen(function* () {
              expect(yield* Effect.serviceOption(PrivateService)).toEqual(Option.none());
              return ChildProcessSpawner.ExitCode(1);
            }),
        })
      )
    );

    const exit = yield* modules
      .get(NpmPluginId.make('npm:fixture'))
      .pipe(Effect.setContext(Context.empty()), Effect.exit);
    expect(exit).toEqual(
      Exit.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
    );
  }).pipe(Effect.scoped, Effect.provide([BunFileSystem.layer, BunModuleResolverLayer]))
);

it.effect('cleans up failed npm installs before retrying with client-safe errors', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directories: Array<string> = [];
    let attempts = 0;
    const modules = yield* PluginModuleMap.make.pipe(
      Effect.provide(
        Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
          exitCode: Effect.fnUntraced(function* (
            command: Parameters<ChildProcessSpawner.ChildProcessSpawner['Service']['exitCode']>[0]
          ) {
            if (command._tag !== 'StandardCommand' || command.options.cwd === void 0) {
              return yield* Effect.die('Expected an installation directory');
            }
            directories.push(command.options.cwd);
            yield* fs.writeFileString(`${command.options.cwd}/partial-install`, 'incomplete');
            attempts += 1;
            return ChildProcessSpawner.ExitCode(1);
          }),
        })
      )
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const exit = yield* modules.get(NpmPluginId.make('npm:fixture')).pipe(Effect.exit);
      expect(exit).toEqual(
        Exit.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
      );
      for (const directory of directories) {
        expect(yield* fs.exists(directory)).toBe(false);
      }
    }
    expect(attempts).toBe(2);
  }).pipe(Effect.scoped, Effect.provide([BunFileSystem.layer, BunModuleResolverLayer]))
);

it.effect(
  'uses the injected resolver in isolation and retries its failures without exposing details',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directories: Array<string> = [];
      let resolutions = 0;
      const modules = yield* PluginModuleMap.make.pipe(
        Effect.provideService(PrivateService, 'host-private'),
        Effect.provideService(ModuleResolver, {
          resolve: (request) =>
            Effect.gen(function* () {
              resolutions += 1;
              expect(request).toEqual({
                specifier: 'plugin/index',
                directory: directories.at(-1),
              });
              expect(yield* Effect.serviceOption(PrivateService)).toEqual(Option.none());
              if (resolutions === 1) {
                return yield* ModuleResolutionError.make({
                  ...request,
                  cause: new Error('Private resolver details'),
                });
              }
              return `${request.directory}/custom-entry.mjs`;
            }),
        }),
        Effect.provide(
          Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
            exitCode: Effect.fnUntraced(function* (
              command: Parameters<ChildProcessSpawner.ChildProcessSpawner['Service']['exitCode']>[0]
            ) {
              if (command._tag !== 'StandardCommand' || command.options.cwd === void 0) {
                return yield* Effect.die('Expected an installation directory');
              }
              const directory = command.options.cwd;
              directories.push(directory);
              yield* fs.writeFileString(
                `${directory}/custom-entry.mjs`,
                'export const ready = true;'
              );
              return ChildProcessSpawner.ExitCode(0);
            }),
          })
        )
      );

      const plugin = NpmPluginId.make('npm:fixture');
      expect(yield* modules.get(plugin).pipe(Effect.exit)).toEqual(
        Exit.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
      );
      for (const directory of directories) {
        expect(yield* fs.exists(directory)).toBe(false);
      }
      const module = yield* modules.get(plugin);
      expect(module).toMatchObject({ ready: true });
      expect(yield* modules.get(plugin)).toBe(module);
      expect(resolutions).toBe(2);
      expect(directories).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(BunFileSystem.layer))
);

it.effect.each(['resolution', 'import'] as const)(
  'cleans up repeated %s failures before retrying with client-safe errors',
  (failure) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directories: Array<string> = [];
      let attempts = 0;
      const modules = yield* PluginModuleMap.make.pipe(
        Effect.provide(
          Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
            exitCode: Effect.fnUntraced(function* (
              command: Parameters<ChildProcessSpawner.ChildProcessSpawner['Service']['exitCode']>[0]
            ) {
              if (command._tag !== 'StandardCommand' || command.options.cwd === void 0) {
                return yield* Effect.die('Expected an installation directory');
              }
              directories.push(command.options.cwd);
              attempts += 1;
              if (failure === 'import' || attempts > 2) {
                const directory = `${command.options.cwd}/node_modules/plugin`;
                yield* fs.makeDirectory(directory, { recursive: true });
                yield* fs.writeFileString(
                  `${directory}/package.json`,
                  '{"name":"fixture","exports":{"./index":"./entry.mjs"}}'
                );
                yield* fs.writeFileString(
                  `${directory}/entry.mjs`,
                  attempts <= 2
                    ? 'throw new Error("private import details");'
                    : 'export const ready = true;'
                );
              }
              return ChildProcessSpawner.ExitCode(0);
            }),
          })
        )
      );

      const plugin = NpmPluginId.make('npm:fixture');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const exit = yield* modules.get(plugin).pipe(Effect.exit);
        expect(exit).toEqual(
          Exit.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
        );
        for (const directory of directories) {
          expect(yield* fs.exists(directory)).toBe(false);
        }
      }
      const module = yield* modules.get(plugin);
      expect(module).toMatchObject({ ready: true });
      expect(yield* modules.get(plugin)).toBe(module);
      expect(attempts).toBe(3);
      expect(directories).toHaveLength(3);
      for (const [index, directory] of directories.entries()) {
        expect(yield* fs.exists(directory)).toBe(index === 2);
      }
    }).pipe(Effect.scoped, Effect.provide([BunFileSystem.layer, BunModuleResolverLayer]))
);
