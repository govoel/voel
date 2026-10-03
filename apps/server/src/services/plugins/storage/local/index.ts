import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginSettings,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Context, Effect, Layer, Path, Schema, SchemaGetter } from 'effect';

class LocalStoragePlugin extends Context.Service<LocalStoragePlugin>()(
  '@repo/server/services/plugins/storage/local/LocalStoragePlugin',
  {
    make: Effect.gen(function* () {
      const path = yield* Path.Path;

      const decodeRootLocation = Schema.decodeEffect(
        Schema.NonEmptyString.check(
          Schema.makeFilter((location) => !location.includes('\0'), {
            message: 'Library root locations must not contain NUL characters',
          }),
          Schema.makeFilter((location) => path.isAbsolute(location), {
            message: 'Library root locations must be absolute paths',
          })
        ).pipe(
          Schema.decodeTo(StorageRootLocation, {
            decode: SchemaGetter.transform((location) => path.resolve(location)),
            encode: SchemaGetter.passthrough(),
          })
        )
      );

      const decodeMediaFileLocation = Schema.decodeEffect(
        Schema.NonEmptyString.check(
          Schema.makeFilter((location) => !location.includes('\0'), {
            message: 'Library file locations must not contain NUL characters',
          }),
          Schema.makeFilter((location) => path.isAbsolute(location), {
            message: 'Library file locations must be absolute paths',
          })
        ).pipe(
          Schema.decodeTo(StorageMediaFileLocation, {
            decode: SchemaGetter.transform((location) => path.resolve(location)),
            encode: SchemaGetter.passthrough(),
          })
        )
      );

      return StoragePlugin.of({
        decodeRootLocation: ({ location }) =>
          decodeRootLocation(location).pipe(
            Effect.catchTag('SchemaError', (error) =>
              StorageLocationValidationError.make({ message: error.message })
            )
          ),
        decodeMediaFileLocation: ({ location }) =>
          decodeMediaFileLocation(location).pipe(
            Effect.catchTag('SchemaError', (error) =>
              StorageLocationValidationError.make({ message: error.message })
            )
          ),
      });
    }),
  }
) {
  public static readonly layer = () => Layer.effect(StoragePlugin, this.make);
}

class LocalStoragePluginSettings extends Context.Service<LocalStoragePluginSettings>()(
  '@repo/server/services/plugins/storage/local/LocalStoragePluginSettings',
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
    layer: LocalStoragePlugin.layer,
    layerSettings: LocalStoragePluginSettings.layer,
  },
} satisfies StoragePluginModule;
