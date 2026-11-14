import { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Data, Effect, Match, Option, Record, Schema, Struct } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export class LibraryEditorMetadata extends Library.jsonCreate.mapFields(
  Struct.pick(['name', 'type', 'storagePluginId'])
) {
  public static readonly decodeUnknownOption = Schema.decodeUnknownOption(this);
}

export type LibraryEditorSource = Data.TaggedEnum<{
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- Create intentionally has no payload.
  Create: Record<never, never>;
  Edit: {
    readonly library: Pick<typeof Library.json.Type, 'id' | 'name' | 'type' | 'storagePluginId'>;
  };
}>;

export const LibraryEditorSource = Data.taggedEnum<LibraryEditorSource>();

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
  LibraryEditorSource.$match(source, {
    Create: () => true,
    Edit: ({ library }) => library.storagePluginId !== storagePluginId,
  }) &&
  !Option.contains(approved, storagePluginId);

const storageFieldSchemas = {
  TextField: StoragePluginSettingsForm.value.cases.TextField.fields.initialValue,
  TextListField: Schema.mutable(
    StoragePluginSettingsForm.value.cases.TextListField.fields.initialValue
  ),
} satisfies Record<(typeof StoragePluginSettingsForm.Type)[number]['kind'], Schema.Top>;

export const storageSettingsSchema = (fields: typeof StoragePluginSettingsForm.Type) =>
  Schema.Struct(
    Record.fromEntries(
      Array.map(fields, (field) => [String(field.name), storageFieldSchemas[field.kind]] as const)
    )
  );

export const settingsDefaults = ({
  fields,
}: {
  readonly fields: typeof StoragePluginSettingsForm.Type;
}) =>
  Record.fromEntries(
    Array.map(
      fields,
      (field) =>
        [
          String(field.name),
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

export const libraryStorageSettingsAtom = Atom.family(
  ({
    account,
    id,
    request,
  }: {
    readonly account: AccountKey;
    readonly id: Option.Option<typeof Library.fields.id.Type>;
    readonly request: typeof LibraryEditorMetadata.Type;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        return yield* client.library.getDraftStoragePluginSettingsForm({
          payload: { ...request, id },
        });
      })
    ).pipe(Atom.withLabel('libraryStorageSettingsAtom'))
);

export const saveLibrary = Effect.fnUntraced(
  function* ({
    account,
    source,
    values,
  }: {
    readonly account: AccountKey;
    readonly source: LibraryEditorSource;
    readonly values: typeof Library.jsonCreate.Type;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    return yield* LibraryEditorSource.$match(source, {
      Create: () => client.library.create({ payload: values }),
      Edit: ({ library }) => client.library.update({ params: { id: library.id }, payload: values }),
    });
  },
  Reactivity.mutation(['library'])
);
