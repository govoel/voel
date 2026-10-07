import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Match, Schema } from 'effect';

/** Only descriptor-declared strings are submitted; plugins own semantic validation. */
export const makeStoragePluginSettingsFormOptions = ({
  fields,
}: {
  readonly fields: StoragePluginSettingsForm;
}) => {
  const entries = fields.map((field) =>
    Match.value(field).pipe(
      Match.tag('TextField', ({ name, initialValue }) => ({
        name,
        schema: Schema.String,
        initialValue,
      })),
      Match.exhaustive
    )
  );

  return {
    schema: Schema.Record(Schema.String, Schema.String)
      .check(Schema.isPropertyNames(Schema.Literals(entries.map(({ name }) => name))))
      .pipe(
        Schema.decodeTo(
          Schema.Struct(Object.fromEntries(entries.map(({ name, schema }) => [name, schema])))
        ),
        Schema.decodeTo(StoragePluginSettingsInput)
      ),
    // Even an empty descriptor array describes a JSON object submission, not void.
    defaultValues: Object.fromEntries(
      entries.map(({ name, initialValue }) => [name, initialValue])
    ),
  };
};
