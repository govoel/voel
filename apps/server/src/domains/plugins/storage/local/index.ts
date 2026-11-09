import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginInvalidSettingsError,
  StoragePluginSettings,
  StoragePluginSettingsError,
  StoragePluginSettingsFieldName,
  StoragePluginSettingsForm,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import {
  Array,
  Context,
  Effect,
  Layer,
  Option,
  Path,
  Predicate,
  Schema,
  SchemaGetter,
  String,
} from 'effect';

class LocalStorageSettings extends Schema.Struct({
  roots: Schema.Array(
    Schema.NonEmptyString.check(
      Schema.makeFilter(Predicate.not(String.includes('\0')), {
        message: 'Directories must not contain NUL characters',
      })
    ).pipe(
      Schema.decodeTo(Schema.NonEmptyString, {
        decode: SchemaGetter.checkEffect((location) =>
          Effect.map(
            Path.Path,
            (path) => path.isAbsolute(location) || 'Directories must be absolute paths'
          )
        ),
        encode: SchemaGetter.passthrough(),
      })
    )
  ).pipe(
    Schema.decodeTo(Schema.Array(Schema.NonEmptyString), {
      decode: SchemaGetter.transformEffect((roots) =>
        Effect.map(Path.Path, (path) =>
          Array.dedupe(Array.map(roots, (root) => path.resolve(root)))
        )
      ),
      encode: SchemaGetter.passthrough(),
    })
  ),
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

class LocalMediaFileLocation extends Schema.NonEmptyString.check(
  Schema.makeFilter(Predicate.not(String.includes('\0')), {
    message: 'Library file locations must not contain NUL characters',
  })
).pipe(
  Schema.decodeTo(Schema.NonEmptyString, {
    decode: SchemaGetter.checkEffect((location) =>
      Effect.map(
        Path.Path,
        (path) => path.isAbsolute(location) || 'Library file locations must be absolute paths'
      )
    ),
    encode: SchemaGetter.passthrough(),
  }),
  Schema.decodeTo(StorageMediaFileLocation, {
    decode: SchemaGetter.transformEffect((location) =>
      Effect.map(Path.Path, (path) => path.resolve(location))
    ),
    encode: SchemaGetter.passthrough(),
  })
) {
  public static readonly decodeEffect = Schema.decodeEffect(this);
}

class LocalStoragePlugin extends Context.Service<LocalStoragePlugin>()(
  '@repo/server/domains/plugins/storage/local/LocalStoragePlugin',
  {
    make: Effect.gen(function* () {
      const path = yield* Path.Path;
      return StoragePlugin.of({
        decodeMediaFileLocation: ({ location }) =>
          LocalMediaFileLocation.decodeEffect(location).pipe(
            Effect.provideService(Path.Path, path),
            Effect.catchTags({
              SchemaError: (error) =>
                StorageLocationValidationError.make({ message: error.message }),
            })
          ),
      });
    }),
  }
) {
  public static readonly layer = () => Layer.effect(StoragePlugin, this.make);
}

class LocalStoragePluginSettings extends Context.Service<LocalStoragePluginSettings>()(
  '@repo/server/domains/plugins/storage/local/LocalStoragePluginSettings',
  {
    make: Effect.gen(function* () {
      const path = yield* Path.Path;
      return StoragePluginSettings.of({
        getForm: Effect.fnUntraced(function* ({ current }) {
          const settings = Option.isSome(current)
            ? yield* LocalStorageSettings.decodeUnknownEffect(current.value).pipe(
                Effect.provideService(Path.Path, path),
                Effect.catchTags({
                  SchemaError: () =>
                    StoragePluginSettingsError.make({
                      message: 'Invalid current local storage settings',
                    }),
                })
              )
            : { roots: [] };
          return StoragePluginSettingsForm.make([
            {
              _tag: 'TextListField',
              purpose: 'text',
              name: StoragePluginSettingsFieldName.make('roots'),
              label: 'Directories',
              placeholder: '/path/to/media',
              initialValue: settings.roots,
            },
          ]);
        }),
        decodeFormSubmission: ({ input }) =>
          LocalStorageSettings.decodeUnknownEffect(input).pipe(
            Effect.provideService(Path.Path, path),
            Effect.catchTags({
              SchemaError: () =>
                StoragePluginInvalidSettingsError.make({
                  message: 'Directories must be non-empty absolute paths without NUL characters',
                }),
            }),
            Effect.map((settings) => StoragePluginSettingsPersisted.make(settings))
          ),
      });
    }),
  }
) {
  public static readonly layer = Layer.effect(StoragePluginSettings, this.make);
}

export default {
  storage: {
    layer: LocalStoragePlugin.layer,
    layerSettings: LocalStoragePluginSettings.layer,
  },
} satisfies StoragePluginModule;
