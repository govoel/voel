import { Array, Effect, Match, Option, Record, Schema, SchemaGetter, SchemaIssue } from 'effect';
import type { Atom } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import type { storagePluginSettingsFormsAtom } from '#src/domains/library/management.ts';

/** The media types a plugin has a settings form for, in display order. */
export const supportedMediaTypes = (
  forms: Atom.Success<ReturnType<typeof storagePluginSettingsFormsAtom>>
) =>
  Array.getSomes(
    Array.map(Library.jsonCreate.fields.type.schema.literals, (type) =>
      Option.map(Option.fromNullishOr(forms[type]), (form) => ({ type, form }))
    )
  );

/**
 * Everything the library editor edits. Settings are kept for each supported media type, so
 * switching types doesn't lose what was entered. Decodes to the create and update payload, using
 * the settings of the selected type.
 *
 * Settings have no client-side rules: plugins validate them on save.
 */
export class LibraryEditorValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Enter a name' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  // Branded keys can't index the settings, so keep the plain literal. Decoding brands it.
  type: Schema.toEncoded(Library.jsonCreate.fields.type),
  storagePluginId: Library.jsonCreate.fields.storagePluginId,
  storagePluginSettings: Schema.Record(
    Schema.toEncoded(Library.jsonCreate.fields.type),
    Schema.optionalKey(
      Schema.Record(
        Schema.String,
        Schema.Union([Schema.String, Schema.mutable(Schema.Array(Schema.String))])
      )
    )
  ),
}).pipe(
  Schema.decodeTo(Library.jsonCreate, {
    decode: SchemaGetter.transformEffect(({ storagePluginSettings, ...library }) =>
      Option.match(Option.fromNullishOr(storagePluginSettings[library.type]), {
        onNone: () =>
          Effect.fail(
            new SchemaIssue.Pointer(
              ['type'],
              new SchemaIssue.InvalidValue({
                message: 'The storage plugin doesn’t support this media type',
              })
            )
          ),
        onSome: (settings) => Effect.succeed({ ...library, storagePluginSettings: settings }),
      })
    ),
    encode: SchemaGetter.forbiddenEncoding,
  })
) {}

/**
 * Starts from the draft's name, and its media type when the plugin supports it. Every supported
 * type starts with its form's initial settings.
 */
export const libraryEditorDefaults = ({
  draft,
  storagePluginId,
  mediaTypes,
}: {
  readonly draft: {
    readonly name: string;
    readonly type: Option.Option<(typeof LibraryEditorValues.Encoded)['type']>;
  };
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
  readonly mediaTypes: Array.NonEmptyReadonlyArray<ReturnType<typeof supportedMediaTypes>[number]>;
}) =>
  ({
    name: draft.name,
    type: Option.getOrElse(
      Option.filter(draft.type, (type) => Array.some(mediaTypes, (media) => media.type === type)),
      () => Array.headNonEmpty(mediaTypes).type
    ),
    storagePluginId,
    storagePluginSettings: Record.fromEntries(
      Array.map(mediaTypes, ({ type, form }) => [
        type,
        Record.fromEntries(
          Array.map(form, (field) => [
            field.name,
            Match.value(field).pipe(
              Match.when({ kind: 'TextField' }, ({ initialValue }) => initialValue),
              Match.when({ kind: 'TextListField' }, ({ initialValue }) => Array.copy(initialValue)),
              Match.exhaustive
            ),
          ])
        ),
      ])
    ),
  }) satisfies typeof LibraryEditorValues.Encoded;
