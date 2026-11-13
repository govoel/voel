import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Effect, Match, Option, Predicate, Record, Schema } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export class LibraryEditorMetadata extends Schema.Struct({
  name: Library.jsonCreate.fields.name.check(Schema.isPattern(/\S/u)),
  type: Library.jsonCreate.fields.type,
  storagePluginId: Library.jsonCreate.fields.storagePluginId,
}) {}

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
  readonly first: typeof LibraryEditorMetadata.Encoded;
  readonly second: typeof LibraryEditorMetadata.Encoded;
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

const storageSettingsSchema = (fields: typeof StoragePluginSettingsForm.Type) =>
  Schema.Struct(
    Record.fromEntries(
      Array.map(
        fields,
        (field) =>
          [
            String(field.name),
            Match.value(field).pipe(
              Match.when({ kind: 'TextField' }, () => Schema.String),
              Match.when({ kind: 'TextListField' }, () =>
                Schema.mutable(Schema.Array(Schema.String))
              ),
              Match.exhaustive
            ),
          ] as const
      )
    )
  );

export const libraryFormSchema = (fields: typeof StoragePluginSettingsForm.Type) =>
  Schema.Struct({
    ...Library.jsonCreate.fields,
    name: LibraryEditorMetadata.fields.name,
    storagePluginSettings: storageSettingsSchema(fields),
  });

export const settingsDefaults = ({
  fields,
  previous,
}: {
  readonly fields: typeof StoragePluginSettingsForm.Type;
  readonly previous: ReturnType<typeof storageSettingsSchema>['Encoded'];
}) =>
  Record.fromEntries(
    Array.map(fields, (field) => {
      const value = Record.get(previous, field.name);
      return [
        String(field.name),
        Match.value(field).pipe(
          Match.when({ kind: 'TextField' }, (descriptor) =>
            Option.getOrElse(
              Option.filter(value, Predicate.isString),
              () => descriptor.initialValue
            )
          ),
          Match.when({ kind: 'TextListField' }, (descriptor) =>
            Option.getOrElse(Option.filter(value, Predicate.not(Predicate.isString)), () =>
              Array.fromIterable(descriptor.initialValue)
            )
          ),
          Match.exhaustive
        ),
      ] as const;
    })
  );

export const fetchLibrarySettings = Effect.fnUntraced(function* ({
  account,
  id,
  request,
}: {
  readonly account: AccountKey;
  readonly id: Option.Option<typeof Library.fields.id.Type>;
  readonly request: typeof LibraryEditorMetadata.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  return yield* client.library.getDraftStoragePluginSettingsForm({
    payload: {
      ...request,
      id,
    },
  });
});

export const libraryStorageSettingsAtom = Atom.family(
  (input: Parameters<typeof fetchLibrarySettings>[0]) =>
    AppRuntime.atom(fetchLibrarySettings(input)).pipe(Atom.withLabel('libraryStorageSettingsAtom'))
);

export const saveLibrary = Effect.fnUntraced(
  function* ({
    account,
    source,
    values,
  }: {
    readonly account: AccountKey;
    readonly source: LibraryEditorSource;
    readonly values: typeof Library.jsonCreate.Encoded;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    const payload = yield* Schema.decodeEffect(Library.jsonCreate)(values);
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
