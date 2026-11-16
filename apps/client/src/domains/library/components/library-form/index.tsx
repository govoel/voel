import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { StoragePluginSettingsForms, StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import { Array, Effect, Match, Option, Record, Schema, String } from 'effect';
import type { Atom } from 'effect/reactivity';
import type { ComponentType } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  createLibrary,
  libraryFormAtom,
  loadStoragePluginSettingsForms,
  mediaTypeLabel,
  mediaTypes,
  updateLibrary,
} from '#src/domains/library/management.ts';

export type LoadedLibraryForm = Atom.Success<ReturnType<typeof libraryFormAtom>>;

export type LibraryFormTarget =
  | { readonly _tag: 'Create' }
  | { readonly _tag: 'Edit'; readonly id: typeof Library.fields.id.Type };

const targetId = ({ target }: { readonly target: LibraryFormTarget }) =>
  Match.value(target).pipe(
    Match.tagsExhaustive({
      Create: () => Option.none(),
      Edit: ({ id }) => Option.some(id),
    })
  );

export const libraryFormQuery = ({
  account,
  target,
}: {
  readonly account: Parameters<typeof libraryFormAtom>[0]['account'];
  readonly target: LibraryFormTarget;
}) => libraryFormAtom({ account, id: targetId({ target }) });

type StoragePluginIdEncoded = typeof Library.json.fields.storagePluginId.Encoded;

const npmPackageName = String.replace(/^npm:/u, '');

/** How people name a storage plugin: built in, or an npm package the server installs. */
const storagePluginName = ({
  storagePluginId,
}: {
  readonly storagePluginId: StoragePluginIdEncoded;
}) =>
  Match.value(storagePluginId).pipe(
    Match.when('builtin:local', () => 'Local folders'),
    Match.when(NpmPluginId.is, (id) => `“${npmPackageName(id)}”`),
    Match.orElse((id) => id)
  );

/** Settings forms are keyed by plain media types, because brands don't survive mapped types. */
const settingsFormFor = ({
  storage,
  type,
}: {
  readonly storage: { readonly forms: typeof StoragePluginSettingsForms.Encoded };
  readonly type: typeof Library.json.fields.type.Encoded;
}) => storage.forms[type];

/**
 * The library, plus the storage plugin it will be saved with: the plugin whose settings forms
 * were loaded last. Settings are kept per media type, so switching types never mixes one form's
 * values into another's, and switching back restores what was entered. Text and list values are
 * kept apart so each field's value has the shape its component edits.
 */
class LibraryFormValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Name is required' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  type: Library.jsonCreate.fields.type,
  storage: Schema.Struct({
    storagePluginId: Library.jsonCreate.fields.storagePluginId,
    forms: StoragePluginSettingsForms,
  }),
  storagePluginSettings: Schema.Record(
    Schema.String,
    Schema.Struct({
      text: Schema.Record(Schema.String, Schema.String),
      list: Schema.Record(Schema.String, Schema.Array(Schema.String)),
    })
  ),
}).check(
  Schema.makeFilter(
    ({ type, storage }) =>
      settingsFormFor({ storage, type }) !== void 0 || {
        path: ['type'],
        issue: `${storagePluginName(storage)} doesn’t support ${mediaTypeLabel({ type })}.`,
      }
  )
) {}

const settingsValues = ({ form }: { readonly form: typeof StoragePluginSettingsForm.Encoded }) => ({
  text: Record.fromEntries(
    Array.flatMap(form, (field) =>
      field.kind === 'TextField' ? [[field.name, field.initialValue] as const] : []
    )
  ),
  list: Record.fromEntries(
    Array.flatMap(form, (field) =>
      field.kind === 'TextListField'
        ? // Start an empty list with one blank entry to type into. Blank entries aren't submitted.
          [
            [
              field.name,
              Array.isReadonlyArrayNonEmpty(field.initialValue) ? field.initialValue : [''],
            ] as const,
          ]
        : []
    )
  ),
});

const storagePluginSettingsValues = ({
  storage,
}: {
  readonly storage: { readonly forms: typeof StoragePluginSettingsForms.Encoded };
}) =>
  Record.fromEntries(
    Array.flatMap(mediaTypes, (type) => {
      const form = settingsFormFor({ storage, type });
      return form === void 0 ? [] : [[type, settingsValues({ form })] as const];
    })
  );

const storagePluginSettingsInput = ({
  form,
  values,
}: {
  readonly form: typeof StoragePluginSettingsForm.Encoded;
  readonly values: (typeof LibraryFormValues.Type)['storagePluginSettings'][string] | undefined;
}) =>
  StoragePluginSettingsInput.make(
    Record.fromEntries(
      Array.map(form, (field) =>
        Match.value(field).pipe(
          Match.discriminatorsExhaustive('kind')({
            TextField: ({ name, initialValue }) =>
              [
                name,
                Option.getOrElse(Record.get(values?.text ?? {}, name), () => initialValue),
              ] as const,
            TextListField: ({ name }) =>
              [
                name,
                Array.filter(
                  Option.getOrElse(Record.get(values?.list ?? {}, name), () => []),
                  String.isNonEmpty
                ),
              ] as const,
          })
        )
      )
    )
  );

export const useLibraryForm = ({
  loaded,
  target,
  onSaved,
}: {
  readonly loaded: LoadedLibraryForm;
  readonly target: LibraryFormTarget;
  readonly onSaved: (library: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: LibraryFormValues,
    defaultValues: {
      name: loaded.name,
      type: loaded.type,
      storage: loaded.storage,
      storagePluginSettings: storagePluginSettingsValues(loaded),
    },
    onSubmit: ({ value }) => {
      const library = {
        name: value.name,
        type: value.type,
        storagePluginId: value.storage.storagePluginId,
        storagePluginSettings: storagePluginSettingsInput({
          form: settingsFormFor({ storage: value.storage, type: value.type }) ?? [],
          values: value.storagePluginSettings[value.type],
        }),
      };
      return Match.value(target).pipe(
        Match.tagsExhaustive({
          Create: () => createLibrary({ account, library }),
          Edit: ({ id }) => updateLibrary({ account, id, library }),
        })
      );
    },
    onFailure: libraryFailureMessage,
    onSuccess: async ({ result }) => onSaved({ id: result.id }),
  });
};

/** Which storage plugin to load: a built-in one, or an npm package named by the person editing. */
class StoragePluginChoice extends Schema.Struct({
  source: Schema.Literals(['builtin:local', 'npm']),
  packageName: Schema.String,
}).check(
  Schema.makeFilter(
    ({ source, packageName }) =>
      source === 'builtin:local' ||
      String.isNonEmpty(String.trim(packageName)) || {
        path: ['packageName'],
        issue: 'Enter a package name',
      }
  )
) {}

const chosenStoragePluginId = ({
  source,
  packageName,
}: typeof StoragePluginChoice.Encoded): StoragePluginIdEncoded =>
  source === 'builtin:local' ? 'builtin:local' : `npm:${String.trim(packageName)}`;

/**
 * Loads a storage plugin's settings forms into the library form, only when asked. Loading an npm
 * plugin makes the server install its package, so typing a package name loads nothing by itself.
 * Edits keep the library's ID, so the new plugin's forms can start from the saved settings.
 */
export const useStoragePluginLoader = ({
  form,
  loaded,
  target,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly loaded: LoadedLibraryForm;
  readonly target: LibraryFormTarget;
}) => {
  const account = useSelectedAccount();
  const loader = useAppForm({
    schema: StoragePluginChoice,
    defaultValues: Match.value(loaded.storage.storagePluginId).pipe(
      Match.when('builtin:local', () => ({ source: 'builtin:local' as const, packageName: '' })),
      Match.orElse((id) => ({ source: 'npm' as const, packageName: npmPackageName(id) }))
    ),
    onSubmit: ({ value }) =>
      Schema.decodeEffect(Library.jsonCreate.fields.storagePluginId)(
        chosenStoragePluginId(value)
      ).pipe(
        Effect.flatMap((storagePluginId) =>
          loadStoragePluginSettingsForms({ account, id: targetId({ target }), storagePluginId })
        )
      ),
    onFailure: libraryFailureMessage,
    onSuccess: ({ result }) => {
      form.setFieldValue('storage', result);
      form.setFieldValue('storagePluginSettings', storagePluginSettingsValues({ storage: result }));
    },
  });
  const chosen = useSelector(loader.store, (state) => chosenStoragePluginId(state.values));
  const loadedId = useSelector(form.store, (state) => state.values.storage.storagePluginId);
  return {
    loader,
    /** The chosen plugin isn't the loaded one, so its settings can't be shown or saved yet. */
    pending: chosen !== loadedId,
    choose: (source: typeof StoragePluginChoice.Encoded.source) => {
      loader.setFieldValue('source', source);
      // Built-in plugins install nothing, so choosing one is the request to load it.
      if (source === 'builtin:local' && loadedId !== 'builtin:local') {
        void loader.handleSubmit();
      }
    },
  };
};

export const storagePluginSources = [
  { source: 'builtin:local', label: 'Local folders' },
  { source: 'npm', label: 'npm package' },
] as const satisfies ReadonlyArray<{
  readonly source: typeof StoragePluginChoice.Encoded.source;
  readonly label: string;
}>;

/** Media types to offer: those the loaded plugin supports, plus the selected type if it doesn't. */
export const useMediaTypeChoices = ({
  form,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
}) => {
  const storage = useSelector(form.store, (state) => state.values.storage);
  const selected = useSelector(form.store, (state) => state.values.type);
  return Array.filter(
    mediaTypes,
    (type) => settingsFormFor({ storage, type }) !== void 0 || type === selected
  );
};

/** The storage settings fields for the selected media type, each bound to its form value. */
export const useStoragePluginSettingsFields = ({
  form,
  pending,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly pending: boolean;
}) => {
  const type = useSelector(form.store, (state) => state.values.type);
  const storage = useSelector(form.store, (state) => state.values.storage);
  if (pending) {
    return { _tag: 'NotLoaded', message: 'Load the plugin to show its settings.' } as const;
  }
  const settingsForm = settingsFormFor({ storage, type });
  if (settingsForm === void 0) {
    return {
      _tag: 'Unsupported',
      message: `${storagePluginName(storage)} doesn’t support ${mediaTypeLabel({ type })}. Choose another media type.`,
    } as const;
  }
  return {
    _tag: 'Supported',
    fields: Array.map(settingsForm, (field) =>
      Match.value(field).pipe(
        Match.discriminatorsExhaustive('kind')({
          TextField: (descriptor) => ({
            ...descriptor,
            key: `${storage.storagePluginId}.${type}.${descriptor.name}`,
            path: `storagePluginSettings.${type}.text.${descriptor.name}` as const,
          }),
          TextListField: (descriptor) => ({
            ...descriptor,
            key: `${storage.storagePluginId}.${type}.${descriptor.name}`,
            path: `storagePluginSettings.${type}.list.${descriptor.name}` as const,
          }),
        })
      )
    ),
  } as const;
};

export type LibraryFormComponent = ComponentType<{
  readonly target: LibraryFormTarget;
  readonly title?: string;
  readonly submitLabel: string;
  readonly onSaved: Parameters<typeof useLibraryForm>[0]['onSaved'];
}>;

export declare const LibraryForm: LibraryFormComponent;
