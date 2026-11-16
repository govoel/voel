import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { StoragePluginSettingsForms, StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import { Array, Match, Option, Record, Schema, SchemaTransformation, String } from 'effect';
import type { Atom } from 'effect/reactivity';
import type { ComponentType } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm, useAppFormGroup } from '#src/components/form';
import { useSubmitState } from '#src/components/form/hooks.tsx';
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

const storagePluginChoice = ({
  storagePluginId,
}: {
  readonly storagePluginId: StoragePluginIdEncoded;
}) =>
  Match.value(storagePluginId).pipe(
    Match.when('builtin:local', () => ({ source: 'builtin:local' as const, packageName: '' })),
    Match.orElse((id) => ({ source: 'npm' as const, packageName: npmPackageName(id) }))
  );

const chosenStoragePluginId = ({
  source,
  packageName,
}: {
  readonly source: 'builtin:local' | 'npm';
  readonly packageName: string;
}): StoragePluginIdEncoded =>
  source === 'builtin:local' ? 'builtin:local' : `npm:${String.trim(packageName)}`;

/**
 * Which storage plugin to use: a built-in one, or an npm package the server installs. Choosing one
 * doesn't load it. Loading an npm plugin installs its package, so that waits until it's asked for.
 */
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
) {
  /** The choice, decoded to the plugin's ID. */
  public static readonly storagePluginId = this.pipe(
    Schema.decodeTo(
      Library.jsonCreate.fields.storagePluginId,
      SchemaTransformation.transform({
        decode: chosenStoragePluginId,
        encode: (storagePluginId) => storagePluginChoice({ storagePluginId }),
      })
    )
  );
}

/**
 * The library, the storage plugin chosen for it, and the storage plugin it will be saved with: the
 * one whose settings forms were loaded last. Settings are kept per media type, so switching types
 * never mixes one form's values into another's, and switching back restores what was entered. Text
 * and list values are kept apart so each field's value has the shape its component edits.
 */
class LibraryFormValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Name is required' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  type: Library.jsonCreate.fields.type,
  storageChoice: StoragePluginChoice.storagePluginId,
  storage: Schema.Struct({
    storagePluginId: Library.jsonCreate.fields.storagePluginId,
    forms: StoragePluginSettingsForms,
    settings: Schema.Record(
      Schema.String,
      Schema.Struct({
        text: Schema.Record(Schema.String, Schema.String),
        list: Schema.Record(Schema.String, Schema.Array(Schema.String)),
      })
    ),
  }),
}).check(
  Schema.makeFilter(
    ({ type, storage }) =>
      settingsFormFor({ storage, type }) !== void 0 || {
        path: ['type'],
        issue: `${storagePluginName(storage)} doesn’t support ${mediaTypeLabel({ type })}.`,
      }
  ),
  Schema.makeFilter(
    ({ storageChoice, storage }) =>
      storageChoice === storage.storagePluginId || {
        path: ['storage'],
        issue: 'Load the storage plugin before saving.',
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

/** A loaded storage plugin, with each of its settings forms starting from its initial values. */
const storageValues = ({ storage }: { readonly storage: LoadedLibraryForm['storage'] }) => ({
  ...storage,
  settings: Record.fromEntries(
    Array.flatMap(mediaTypes, (type) => {
      const form = settingsFormFor({ storage, type });
      return form === void 0 ? [] : [[type, settingsValues({ form })] as const];
    })
  ),
});

const storagePluginSettingsInput = ({
  form,
  values,
}: {
  readonly form: typeof StoragePluginSettingsForm.Encoded;
  readonly values: (typeof LibraryFormValues.Type)['storage']['settings'][string] | undefined;
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
      storageChoice: storagePluginChoice(loaded.storage),
      storage: storageValues(loaded),
    },
    onSubmit: ({ value }) => {
      const library = {
        name: value.name,
        type: value.type,
        storagePluginId: value.storage.storagePluginId,
        storagePluginSettings: storagePluginSettingsInput({
          form: settingsFormFor({ storage: value.storage, type: value.type }) ?? [],
          values: value.storage.settings[value.type],
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

/**
 * Loads the chosen storage plugin's settings forms into the library form, only when asked. Edits
 * keep the library's ID, so the new plugin's forms can start from the saved settings.
 */
export const useStoragePluginLoader = ({
  form,
  target,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly target: LibraryFormTarget;
}) => {
  const account = useSelectedAccount();
  const loader = useAppFormGroup({
    form,
    name: 'storageChoice',
    schema: StoragePluginChoice.storagePluginId,
    onSubmit: ({ value }) =>
      loadStoragePluginSettingsForms({ account, id: targetId({ target }), storagePluginId: value }),
    onFailure: libraryFailureMessage,
    onSuccess: ({ result }) => {
      form.setFieldValue('storage', storageValues({ storage: result }));
    },
  });
  return {
    loader,
    /** The chosen plugin isn't the loaded one, so its settings can't be shown or saved yet. */
    pending: useSelector(
      form.store,
      ({ values }) => chosenStoragePluginId(values.storageChoice) !== values.storage.storagePluginId
    ),
    choose: (source: (typeof StoragePluginChoice.Encoded)['source']) => {
      form.setFieldValue('storageChoice.source', source);
      // Built-in plugins install nothing, so choosing one is the request to load it.
      if (source === 'builtin:local' && form.state.values.storage.storagePluginId !== source) {
        void loader.handleSubmit();
      }
    },
    /** Loads the chosen plugin. Resolves with whether its settings for the media type are editable. */
    load: async () => {
      await loader.handleSubmit();
      const { values } = form.state;
      return (
        chosenStoragePluginId(values.storageChoice) === values.storage.storagePluginId &&
        settingsFormFor({ storage: values.storage, type: values.type }) !== void 0
      );
    },
  };
};

const npmPluginWarning =
  'Loading a plugin downloads it and runs its code on your server. Only use plugins you trust.';

export const storagePluginSources = [
  { source: 'builtin:local', label: 'Local folders' },
  { source: 'npm', label: 'Custom plugin' },
] as const satisfies ReadonlyArray<{
  readonly source: (typeof StoragePluginChoice.Encoded)['source'];
  readonly label: string;
}>;

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
    return { _tag: 'NotLoaded' } as const;
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
            path: `storage.settings.${type}.text.${descriptor.name}` as const,
          }),
          TextListField: (descriptor) => ({
            ...descriptor,
            key: `${storage.storagePluginId}.${type}.${descriptor.name}`,
            path: `storage.settings.${type}.list.${descriptor.name}` as const,
          }),
        })
      )
    ),
  } as const;
};

/**
 * The row that opens the storage settings, and the notes shown below it. Until the chosen plugin is
 * loaded, the row loads it first, then opens its settings if they support the selected media type.
 * Render inside the form's `AppForm`.
 */
export const useStorageSettingsRow = ({
  form,
  plugin,
  settings,
  onEdit,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly plugin: ReturnType<typeof useStoragePluginLoader>;
  readonly settings: ReturnType<typeof useStoragePluginSettingsFields>;
  readonly onEdit: () => void;
}) => {
  const loading = useSubmitState({ group: plugin.loader });
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const source = useSelector(form.store, (state) => state.values.storageChoice.source);
  return {
    label: settings._tag === 'NotLoaded' ? 'Load plugin & edit settings' : 'Storage settings',
    isLoading: loading.isSubmitting,
    enabled:
      !isSaving &&
      Match.value(settings).pipe(
        Match.tagsExhaustive({
          NotLoaded: () => loading.canSubmit && !loading.isSubmitting,
          Unsupported: () => false,
          Supported: () => true,
        })
      ),
    open: async () => {
      if (settings._tag === 'Supported' || (await plugin.load())) {
        onEdit();
      }
    },
    notes: Array.getSomes([
      Option.map(loading.errorMessage, (message) => ({ tone: 'critical' as const, message })),
      settings._tag === 'Unsupported'
        ? Option.some({ tone: 'critical' as const, message: settings.message })
        : Option.none(),
      source === 'npm'
        ? Option.some({ tone: 'secondary' as const, message: npmPluginWarning })
        : Option.none(),
    ]),
  };
};

export type LibraryFormComponent = ComponentType<{
  readonly target: LibraryFormTarget;
  readonly title?: string;
  readonly submitLabel: string;
  readonly onSaved: Parameters<typeof useLibraryForm>[0]['onSaved'];
}>;

export declare const LibraryForm: LibraryFormComponent;
