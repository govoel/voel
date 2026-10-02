import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginSettings,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Effect, Layer, Path, Schema, SchemaParser } from 'effect';

class LocalStorage extends Context.Service<LocalStorage>()(
  '@repo/server/services/plugins/storage/local/LocalStorage',
  {
    make: Effect.gen(function* () {
      const path = yield* Path.Path;

      const decodeRootLocation = SchemaParser.decodeEffect(
        StorageRootLocation.check(
          Schema.makeFilter((location) => !location.includes('\0'), {
            message: 'Library root locations must not contain NUL characters',
          }),
          Schema.makeFilter((location) => path.isAbsolute(location), {
            message: 'Library root locations must be absolute paths',
          })
        )
      );

      const decodeMediaFileLocation = SchemaParser.decodeEffect(
        StorageMediaFileLocation.check(
          Schema.makeFilter((location) => !location.includes('\0'), {
            message: 'Library file locations must not contain NUL characters',
          }),
          Schema.makeFilter((location) => path.isAbsolute(location), {
            message: 'Library file locations must be absolute paths',
          })
        )
      );

      return StoragePlugin.of({
        decodeRootLocation: ({ location }) => decodeRootLocation(location),
        decodeMediaFileLocation: ({ location }) => decodeMediaFileLocation(location),
      });
    }),
  }
) {
  public static readonly layer = () => Layer.effect(StoragePlugin, this.make);
}

class LocalStorageSettings extends Context.Service<LocalStorageSettings>()(
  '@repo/server/services/plugins/storage/local/LocalStorageSettings',
  {
    make: Effect.succeed(
      StoragePluginSettings.of({
        getForm: () => Effect.succeed([]),
        decodeFormSubmission: () => Effect.succeed(StoragePluginSettingsPersisted.make({})),
      })
    ),
  }
) {
  public static readonly layer = () => Layer.effect(StoragePluginSettings, this.make);
}

export default {
  storage: {
    layer: LocalStorage.layer,
    layerSettings: LocalStorageSettings.layer,
  },
} satisfies StoragePluginModule;
