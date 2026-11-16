import { StoragePluginSettingsForm, StoragePluginSettingsForms } from '@govoel/plugins/storage';
import {
  Array,
  Data,
  Effect,
  Match,
  Option,
  Record,
  Schema,
  SchemaGetter,
  SchemaIssue,
  SchemaParser,
} from 'effect';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

export type LibraryEditorSource = Data.TaggedEnum<{
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- Create intentionally has no payload.
  Create: Record<never, never>;
  Edit: {
    readonly library: Pick<typeof Library.json.Type, 'id' | 'name' | 'type' | 'storagePluginId'>;
  };
}>;

export const LibraryEditorSource = Data.taggedEnum<LibraryEditorSource>();

/** Loading an npm plugin runs its code on the server. A library's saved plugin is already trusted. */
export const requiresPluginConsent = ({
  source,
  storagePluginId,
}: {
  readonly source: LibraryEditorSource;
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
}) =>
  NpmPluginId.is(storagePluginId) &&
  LibraryEditorSource.$match(source, {
    Create: () => true,
    Edit: ({ library }) => library.storagePluginId !== storagePluginId,
  });

const storageFieldSchemas = {
  TextField: StoragePluginSettingsForm.value.cases.TextField.fields.initialValue,
  TextListField: Schema.mutable(
    StoragePluginSettingsForm.value.cases.TextListField.fields.initialValue
  ),
} satisfies Record<(typeof StoragePluginSettingsForm.Type)[number]['kind'], Schema.Top>;

/** Validates the values of one settings form. */
export const storageSettingsSchema = (form: typeof StoragePluginSettingsForm.Type) =>
  Schema.Struct(
    Record.fromEntries<
      readonly [string, (typeof storageFieldSchemas)[keyof typeof storageFieldSchemas]]
    >(Array.map(form, (field) => [field.name, storageFieldSchemas[field.kind]] as const))
  );

const settingsDefaults = (form: typeof StoragePluginSettingsForm.Type) =>
  Record.fromEntries<
    readonly [string, (typeof storageFieldSchemas)[keyof typeof storageFieldSchemas]['Type']]
  >(
    Array.map(
      form,
      (field) =>
        [
          field.name,
          Match.value(field).pipe(
            Match.when({ kind: 'TextField' }, (descriptor) => descriptor.initialValue),
            Match.when({ kind: 'TextListField' }, (descriptor) =>
              Array.fromIterable(descriptor.initialValue)
            ),
            Match.exhaustive
          ),
        ] as const
    )
  );

const mediaTypes = Library.jsonCreate.fields.type.schema.literals;

/** Reads a media type's entry from a record that only has entries for supported types. */
export const forMediaType = <A>(
  record: Readonly<Partial<Record<(typeof mediaTypes)[number], A>>>,
  type: (typeof mediaTypes)[number]
) => Option.fromNullishOr(record[type]);

/** A loaded plugin's forms, and the values for each media type it supports. */
class StorageDraft extends Schema.Struct({
  storagePluginId: Schema.toType(Library.jsonCreate.fields.storagePluginId),
  forms: Schema.toType(StoragePluginSettingsForms),
  settings: Schema.Record(
    Schema.toEncoded(Library.jsonCreate.fields.type),
    Schema.optionalKey(
      Schema.Record(
        Schema.String,
        Schema.Union([storageFieldSchemas.TextField, storageFieldSchemas.TextListField])
      )
    )
  ),
}) {}

/** Starts a draft for freshly loaded forms, with every supported media type at its defaults. */
export const storageDraft = ({
  storagePluginId,
  forms,
}: Pick<typeof StorageDraft.Type, 'storagePluginId' | 'forms'>) =>
  ({
    storagePluginId,
    forms,
    settings: Record.fromEntries(
      Array.getSomes(
        Array.map(mediaTypes, (type) =>
          Option.map(forMediaType(forms, type), (form) => [type, settingsDefaults(form)] as const)
        )
      )
    ),
  }) satisfies typeof StorageDraft.Encoded;

class LibraryEditorDraft extends Schema.Struct({
  name: Library.jsonCreate.fields.name,
  type: Library.jsonCreate.fields.type,
  /** The plugin being entered. `storage` holds the plugin that's loaded. */
  storagePluginId: Library.jsonCreate.fields.storagePluginId,
  storage: StorageDraft,
}) {}

const issueAt = (path: ReadonlyArray<PropertyKey>, message: string) =>
  new SchemaIssue.Pointer(path, new SchemaIssue.InvalidValue({ message }));

/**
 * Everything the library editor edits. Decodes straight to the create/update payload, so the form
 * can only submit once the entered plugin is loaded, supports the media type, and its settings for
 * that type are valid.
 */
export const LibraryEditorValues = LibraryEditorDraft.pipe(
  Schema.decodeTo(Library.jsonCreate, {
    decode: SchemaGetter.transformEffect(({ storage, ...metadata }, options) => {
      if (metadata.storagePluginId !== storage.storagePluginId) {
        // Points at `storage`, not the plugin ID, so it can't block the group that loads it.
        return Effect.fail(issueAt(['storage'], 'Load the storage plugin before saving'));
      }
      return Option.match(forMediaType(storage.forms, metadata.type), {
        onNone: () =>
          Effect.fail(issueAt(['type'], "The storage plugin doesn't support this media type")),
        onSome: (form) =>
          SchemaParser.decodeEffect(storageSettingsSchema(form))(
            Option.getOrElse(forMediaType(storage.settings, metadata.type), () => ({})),
            options
          ).pipe(
            Effect.mapBoth({
              onFailure: (issue) =>
                new SchemaIssue.Pointer(['storage', 'settings', metadata.type], issue),
              onSuccess: (storagePluginSettings) => ({
                ...metadata,
                storagePluginSettings,
              }),
            })
          ),
      });
    }),
    encode: SchemaGetter.forbiddenEncoding,
  })
);
