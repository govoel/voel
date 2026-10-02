import { BunFileSystem, BunPath } from '@effect/platform-bun';
import type { Library as PluginLibrary } from '@govoel/plugins/library';
import type { StoragePluginModule } from '@govoel/plugins/storage';
import { Context, Effect, Layer, LayerMap, Match } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import type { Library } from '@repo/spec-api/database/schema.ts';
import { StoragePluginLoadError } from '@repo/spec-api/plugins/storage.ts';

import local from '#src/services/plugins/storage/local/index.ts';

/** Resolve the shared module contract independently of configured storage. */
export class StoragePluginModuleMap extends Context.Service<StoragePluginModuleMap>()(
  '@repo/server/services/plugins/storage/StoragePluginModuleMap',
  {
    make: Effect.succeed({
      get: (plugin: Library['storagePlugin']) =>
        Match.value(plugin).pipe(
          Match.when('builtin:local', () => Effect.succeed<StoragePluginModule>(local)),
          Match.orElse(() =>
            Effect.fail(
              StoragePluginLoadError.make({
                message: 'External storage plugins are not supported yet',
              })
            )
          )
        ),
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}

/** Editors for persisted libraries are keyed by their complete library context. */
export class StoragePluginSettingsMap extends LayerMap.Service<StoragePluginSettingsMap>()(
  '@repo/server/services/plugins/storage/StoragePluginSettingsMap',
  {
    idleTimeToLive: '5 minutes',
    dependencies: [
      StoragePluginModuleMap.layer,
      BunFileSystem.layer,
      BunPath.layer,
      FetchHttpClient.layer,
    ],
    lookup: (request: {
      readonly library: typeof PluginLibrary.Type;
      readonly storagePlugin: Library['storagePlugin'];
    }) =>
      Layer.unwrap(
        StoragePluginModuleMap.use((plugins) =>
          plugins
            .get(request.storagePlugin)
            .pipe(
              Effect.map((module) => module.storage.layerSettings({ library: request.library }))
            )
        )
      ),
  }
) {}

/** Storage instances are keyed by their complete library context, plugin, and settings. */
export class StoragePluginMap extends LayerMap.Service<StoragePluginMap>()(
  '@repo/server/services/plugins/storage/StoragePluginMap',
  {
    idleTimeToLive: '5 minutes',
    dependencies: [
      StoragePluginModuleMap.layer,
      BunFileSystem.layer,
      BunPath.layer,
      FetchHttpClient.layer,
    ],
    lookup: (
      request: Parameters<StoragePluginModule['storage']['layer']>[0] & {
        readonly storagePlugin: Library['storagePlugin'];
      }
    ) =>
      Layer.unwrap(
        StoragePluginModuleMap.use((plugins) =>
          plugins
            .get(request.storagePlugin)
            .pipe(
              Effect.map((module) =>
                module.storage.layer({ library: request.library, settings: request.settings })
              )
            )
        )
      ),
  }
) {}
