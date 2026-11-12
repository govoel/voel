import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Array, Effect, Match, Option, Record, Schema } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';

export class LibraryEditorMetadata extends Schema.Struct({
  name: Library.jsonCreate.fields.name.check(Schema.isPattern(/\S/u)),
  type: Library.jsonCreate.fields.type,
  storagePluginId: Library.jsonCreate.fields.storagePluginId,
}) {}

const SettingsEntryId = Schema.Natural.pipe(
  Schema.brand('voel/domains/library/editor/SettingsEntryId')
);

export class LibraryEditorValues extends Schema.Struct({
  ...LibraryEditorMetadata.fields,
  textValues: Schema.Record(Schema.String, Schema.String),
  listValues: Schema.Record(
    Schema.String,
    Schema.mutable(
      Schema.Array(
        Schema.Struct({
          key: SettingsEntryId,
          value: Schema.String,
        })
      )
    )
  ),
}) {}

let entrySequence = 0;
export const newSettingsEntry = ({ value }: { readonly value: string }) => {
  entrySequence += 1;
  return { key: SettingsEntryId.make(entrySequence), value };
};

export type LibraryEditorSource =
  | { readonly _tag: 'Create' }
  | {
      readonly _tag: 'Edit';
      readonly library: Pick<typeof Library.json.Type, 'id' | 'name' | 'type' | 'storagePluginId'>;
    };

export const sameSettingsRequest = ({
  first,
  second,
}: {
  readonly first: typeof LibraryEditorMetadata.Type;
  readonly second: typeof LibraryEditorMetadata.Type;
}) =>
  first.name === second.name &&
  first.type === second.type &&
  first.storagePluginId === second.storagePluginId;

export const requiresPluginConsent = ({
  source,
  storagePluginId,
  approved,
}: {
  readonly source: LibraryEditorSource;
  readonly storagePluginId: typeof LibraryEditorMetadata.Type.storagePluginId;
  readonly approved: Option.Option<typeof LibraryEditorMetadata.Type.storagePluginId>;
}) =>
  NpmPluginId.is(storagePluginId) &&
  !(source._tag === 'Edit' && source.library.storagePluginId === storagePluginId) &&
  !Option.contains(approved, storagePluginId);

export const settingsValues = ({
  fields,
  previous,
}: {
  readonly fields: typeof StoragePluginSettingsForm.Type;
  readonly previous: Option.Option<
    Pick<typeof LibraryEditorValues.Encoded, 'textValues' | 'listValues'>
  >;
}) => ({
  textValues: Record.fromEntries(
    Array.map(
      Array.filter(fields, (field) => field.kind === 'TextField'),
      (field) =>
        [
          field.name,
          Option.match(previous, {
            onNone: () => field.initialValue,
            onSome: (value) =>
              Option.getOrElse(Record.get(value.textValues, field.name), () => field.initialValue),
          }),
        ] as const
    )
  ),
  listValues: Record.fromEntries(
    Array.map(
      Array.filter(fields, (field) => field.kind === 'TextListField'),
      (field) =>
        [
          field.name,
          Option.match(previous, {
            onNone: () => Array.map(field.initialValue, (value) => newSettingsEntry({ value })),
            onSome: (value) =>
              Option.getOrElse(Record.get(value.listValues, field.name), () =>
                Array.map(field.initialValue, (text) => newSettingsEntry({ value: text }))
              ),
          }),
        ] as const
    )
  ),
});

export const settingsSubmission = ({
  fields,
  values,
}: {
  readonly fields: typeof StoragePluginSettingsForm.Type;
  readonly values: typeof LibraryEditorValues.Type;
}) =>
  Schema.decodeUnknownEffect(StoragePluginSettingsInput)(
    Record.fromEntries(
      Array.map(fields, (field) =>
        Match.value(field).pipe(
          Match.when({ kind: 'TextField' }, ({ name }) => [name, values.textValues[name]] as const),
          Match.when(
            { kind: 'TextListField' },
            ({ name }) =>
              [name, Array.map(values.listValues[name] ?? [], ({ value }) => value)] as const
          ),
          Match.exhaustive
        )
      )
    )
  );

export const fetchLibrarySettings = Effect.fnUntraced(function* ({
  account,
  source,
  request,
}: {
  readonly account: AccountKey;
  readonly source: LibraryEditorSource;
  readonly request: typeof LibraryEditorMetadata.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  return yield* client.library.getDraftStoragePluginSettingsForm({
    payload: {
      ...request,
      id: source._tag === 'Edit' ? Option.some(source.library.id) : Option.none(),
    },
  });
});

export const saveLibrary = Effect.fnUntraced(
  function* ({
    account,
    source,
    values,
    fields,
  }: {
    readonly account: AccountKey;
    readonly source: LibraryEditorSource;
    readonly values: typeof LibraryEditorValues.Type;
    readonly fields: typeof StoragePluginSettingsForm.Type;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    const payload = {
      name: values.name,
      type: values.type,
      storagePluginId: values.storagePluginId,
      storagePluginSettings: yield* settingsSubmission({ fields, values }),
    };
    return yield* Match.value(source).pipe(
      Match.when({ _tag: 'Create' }, () => client.library.create({ payload })),
      Match.when({ _tag: 'Edit' }, ({ library }) =>
        client.library.update({ params: { id: library.id }, payload })
      ),
      Match.exhaustive
    );
  },
  Reactivity.mutation(['library'])
);
