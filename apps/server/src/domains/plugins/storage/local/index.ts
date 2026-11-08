import type { StoragePluginModule } from '@govoel/plugins/storage';
import {
  StorageLocationValidationError,
  StorageMediaFileLocation,
  StoragePlugin,
  StoragePluginConstructionError,
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

const settingsSchema = ({ path }: { readonly path: Path.Path }) =>
  Schema.Struct({
    roots: Schema.Array(
      Schema.NonEmptyString.check(
        Schema.makeFilter(Predicate.not(String.includes('\0')), {
          message: 'Directories must not contain NUL characters',
        }),
        Schema.makeFilter((location) => path.isAbsolute(location), {
          message: 'Directories must be absolute paths',
        })
      )
    ).pipe(
      Schema.decodeTo(Schema.Array(Schema.NonEmptyString), {
        decode: SchemaGetter.transform((roots) =>
          Array.dedupe(Array.map(roots, (root) => path.resolve(root)))
        ),
        encode: SchemaGetter.passthrough(),
      })
    ),
  });

class LocalStoragePlugin extends Context.Service<LocalStoragePlugin>()(
  '@repo/server/domains/plugins/storage/local/LocalStoragePlugin',
  {
    make: Effect.fnUntraced(function* ({
      settings,
    }: Parameters<StoragePluginModule['storage']['layer']>[0]) {
      const path = yield* Path.Path;
      yield* Schema.decodeUnknownEffect(settingsSchema({ path }))(settings).pipe(
        Effect.catchTags({
          SchemaError: () =>
            StoragePluginConstructionError.make({ message: 'Invalid local storage settings' }),
        })
      );
      const decodeMediaFileLocation = Schema.decodeEffect(
        Schema.NonEmptyString.check(
          Schema.makeFilter(Predicate.not(String.includes('\0')), {
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
        decodeMediaFileLocation: ({ location }) =>
          decodeMediaFileLocation(location).pipe(
            Effect.catchTags({
              SchemaError: (error) =>
                StorageLocationValidationError.make({ message: error.message }),
            })
          ),
      });
    }),
  }
) {
  public static readonly layer = (
    request: Parameters<StoragePluginModule['storage']['layer']>[0]
  ) => Layer.effect(StoragePlugin, this.make(request));
}

class LocalStoragePluginSettings extends Context.Service<LocalStoragePluginSettings>()(
  '@repo/server/domains/plugins/storage/local/LocalStoragePluginSettings',
  {
    make: Effect.gen(function* () {
      const path = yield* Path.Path;
      const decode = Schema.decodeUnknownEffect(settingsSchema({ path }));
      return StoragePluginSettings.of({
        getForm: Effect.fnUntraced(function* ({ current }) {
          const settings = Option.isSome(current)
            ? yield* decode(current.value).pipe(
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
              name: StoragePluginSettingsFieldName.make('roots'),
              label: 'Directories',
              placeholder: '/path/to/media',
              initialValue: settings.roots,
            },
          ]);
        }),
        decodeFormSubmission: ({ input }) =>
          decode(input).pipe(
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
