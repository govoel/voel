import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { MediaType } from '@govoel/plugins/library';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { StoragePluginSettingsForms } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import {
  Array,
  Data,
  Effect,
  Match,
  Option,
  Record,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
  String,
} from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';
import { useState } from 'react';
import type { ComponentProps, ComponentType, ReactElement } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm, useAppFormGroup } from '#src/components/form';
import { useSubmitState } from '#src/components/form/hooks.tsx';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryFormTarget } from '#src/domains/library/components/library-form/target.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  byMediaType,
  createLibrary,
  libraryFormAtom,
  loadStoragePluginSettingsForms,
  mediaTypeLabel,
  updateLibrary,
} from '#src/domains/library/management.ts';

type LoadedLibraryForm = Atom.Success<ReturnType<typeof libraryFormAtom>>;

const targetId = ({ target }: { readonly target: LibraryFormTarget }) =>
  LibraryFormTarget.$match(target, {
    Create: () => Option.none(),
    Edit: ({ id }) => Option.some(id),
  });

type StoragePluginId = typeof Library.jsonCreate.fields.storagePluginId.Type;

const npmPackageName = (id: typeof NpmPluginId.Type) =>
  String.slice(NpmPluginId.parts[0].length)(id);

const storagePluginName = ({ storagePluginId }: { readonly storagePluginId: StoragePluginId }) =>
  Match.value(storagePluginId).pipe(
    Match.when('builtin:local', () => 'Local folders'),
    Match.when(NpmPluginId.is, (id) => `“${npmPackageName(id)}”`),
    Match.exhaustive
  );

const settingsFormFor = ({
  storage,
  type,
}: {
  readonly storage: { readonly forms: typeof StoragePluginSettingsForms.Encoded };
  readonly type: typeof MediaType.Encoded;
}) => Option.fromUndefinedOr(storage.forms[type]);

const unsupportedMediaTypeMessage = ({
  storage,
  type,
}: {
  readonly storage: { readonly storagePluginId: StoragePluginId };
  readonly type: typeof MediaType.Encoded;
}) => `${storagePluginName(storage)} doesn’t support ${mediaTypeLabel({ type })}.`;

const settingsValuesFor = <A,>({
  storage,
  type,
}: {
  readonly storage: { readonly settings: Record.ReadonlyRecord<typeof MediaType.Encoded, A> };
  readonly type: typeof MediaType.Encoded;
}) => storage.settings[type];

const StoragePluginSource = Schema.Literals(['builtin:local', 'npm']);

const storagePluginChoice = ({ storagePluginId }: { readonly storagePluginId: StoragePluginId }) =>
  Match.value(storagePluginId).pipe(
    Match.when('builtin:local', () => ({ source: 'builtin:local' as const, packageName: '' })),
    Match.when(NpmPluginId.is, (id) => ({
      source: 'npm' as const,
      packageName: npmPackageName(id),
    })),
    Match.exhaustive
  );

const chosenStoragePluginId = ({
  source,
  packageName,
}: {
  readonly source: typeof StoragePluginSource.Type;
  readonly packageName: string;
}) =>
  Match.value(source).pipe(
    Match.when('builtin:local', (id) => id),
    Match.when('npm', () => `npm:${String.trim(packageName)}` as const),
    Match.exhaustive
  );

class StoragePluginChoice extends Schema.Struct({
  source: StoragePluginSource,
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
  public static readonly storagePluginId = this.pipe(
    Schema.decodeTo(Library.jsonCreate.fields.storagePluginId, {
      decode: SchemaGetter.transform(chosenStoragePluginId),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );
}

class StorageSettingsValues extends Schema.Struct({
  text: Schema.Record(Schema.String, Schema.String),
  list: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}) {}

const storagePluginSettingsInput = ({
  form,
  values,
}: {
  readonly form: typeof StoragePluginSettingsForm.Encoded;
  readonly values: typeof StorageSettingsValues.Type;
}) =>
  Record.fromEntries(
    Array.map(form, (field) =>
      Match.value(field).pipe(
        Match.discriminatorsExhaustive('kind')({
          TextField: ({ name, initialValue }) =>
            [name, Option.getOrElse(Record.get(values.text, name), () => initialValue)] as const,
          TextListField: ({ name }) =>
            [
              name,
              Array.filter(
                Option.getOrElse(Record.get(values.list, name), () => []),
                String.isNonEmpty
              ),
            ] as const,
        })
      )
    )
  );

class LibraryFormValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Name is required' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  type: Library.jsonCreate.fields.type,
  storageChoice: StoragePluginChoice.storagePluginId,
  storage: Schema.Struct({
    storagePluginId: Schema.toType(Library.jsonCreate.fields.storagePluginId),
    forms: StoragePluginSettingsForms,
    settings: Schema.Record(Schema.toEncoded(MediaType), StorageSettingsValues),
  }),
}).check(
  Schema.makeFilter(
    ({ storageChoice, storage }) =>
      storageChoice === storage.storagePluginId || {
        path: ['storage'],
        issue: 'Load the storage plugin before saving.',
      }
  )
) {
  public static readonly library = this.pipe(
    Schema.decodeTo(Library.jsonCreate, {
      decode: SchemaGetter.transformEffect(({ name, type, storage }, options) =>
        Effect.fromOption(
          settingsFormFor({ storage, type }),
          () =>
            new SchemaIssue.Pointer(
              ['type'],
              new SchemaIssue.InvalidValue(
                { message: unsupportedMediaTypeMessage({ storage, type }) },
                type,
                options
              )
            )
        ).pipe(
          Effect.map((form) => ({
            name,
            type,
            storagePluginId: storage.storagePluginId,
            storagePluginSettings: storagePluginSettingsInput({
              form,
              values: settingsValuesFor({ storage, type }),
            }),
          }))
        )
      ),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );
}

const settingsValues = ({ form }: { readonly form: typeof StoragePluginSettingsForm.Encoded }) => {
  const [text, list] = Array.partition(form, (field) =>
    Match.value(field).pipe(
      Match.discriminatorsExhaustive('kind')({
        TextField: ({ name, initialValue }) => Result.succeed([name, initialValue] as const),
        TextListField: ({ name, initialValue }) =>
          Result.fail([
            name,
            Array.isReadonlyArrayNonEmpty(initialValue) ? initialValue : [''],
          ] as const),
      })
    )
  );
  return { text: Record.fromEntries(text), list: Record.fromEntries(list) };
};

const storageValues = ({ storage }: { readonly storage: LoadedLibraryForm['storage'] }) => ({
  ...storage,
  settings: byMediaType((type) =>
    Option.match(settingsFormFor({ storage, type }), {
      onNone: () => ({ text: {}, list: {} }),
      onSome: (form) => settingsValues({ form }),
    })
  ),
});

const useLibraryForm = ({
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
    schema: LibraryFormValues.library,
    defaultValues: {
      name: loaded.name,
      type: loaded.type,
      storageChoice: storagePluginChoice(loaded.storage),
      storage: storageValues(loaded),
    },
    onSubmit: ({ value: library }) =>
      LibraryFormTarget.$match(target, {
        Create: () => createLibrary({ account, library }),
        Edit: ({ id }) => updateLibrary({ account, id, library }),
      }),
    onFailure: libraryFailureMessage,
    onSuccess: async ({ result }) => onSaved({ id: result.id }),
  });
};

const isChosenPluginLoaded = ({
  storageChoice,
  storage,
}: Pick<typeof LibraryFormValues.Encoded, 'storageChoice' | 'storage'>) =>
  chosenStoragePluginId(storageChoice) === storage.storagePluginId;

const useStoragePluginLoader = ({
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
    isChosenLoaded: useSelector(form.store, ({ values }) => isChosenPluginLoaded(values)),
    choose: (source: typeof StoragePluginSource.Type) => {
      form.setFieldValue('storageChoice.source', source);
      Match.value(source).pipe(
        Match.when('builtin:local', (id) => {
          if (form.state.values.storage.storagePluginId !== id) {
            void loader.handleSubmit();
          }
        }),
        Match.when('npm', () => void 0),
        Match.exhaustive
      );
    },
    load: async () => {
      await loader.handleSubmit();
      const { values } = form.state;
      return (
        isChosenPluginLoaded(values) &&
        Option.isSome(settingsFormFor({ storage: values.storage, type: values.type }))
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
  readonly source: typeof StoragePluginSource.Type;
  readonly label: string;
}>;

const storageSettingsFields = ({
  settingsForm,
  storagePluginId,
  type,
}: {
  readonly settingsForm: typeof StoragePluginSettingsForm.Encoded;
  readonly storagePluginId: StoragePluginId;
  readonly type: typeof MediaType.Encoded;
}) =>
  Array.map(settingsForm, (field) =>
    Match.value(field).pipe(
      Match.discriminatorsExhaustive('kind')({
        TextField: (descriptor) => ({
          ...descriptor,
          key: `${storagePluginId}.${type}.${descriptor.name}`,
          path: `storage.settings.${type}.text.${descriptor.name}` as const,
        }),
        TextListField: (descriptor) => ({
          ...descriptor,
          key: `${storagePluginId}.${type}.${descriptor.name}`,
          path: `storage.settings.${type}.list.${descriptor.name}` as const,
        }),
      })
    )
  );

type StorageSettingsState = Data.TaggedEnum<{
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- NotLoaded intentionally has no payload.
  NotLoaded: Record<never, never>;
  Unsupported: { readonly message: string };
  Supported: { readonly fields: ReturnType<typeof storageSettingsFields> };
}>;

export const StorageSettingsState = Data.taggedEnum<StorageSettingsState>();

const notLoaded = StorageSettingsState.NotLoaded();

const useStorageSettings = ({
  form,
  isChosenLoaded,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly isChosenLoaded: boolean;
}) => {
  const type = useSelector(form.store, (state) => state.values.type);
  const storage = useSelector(form.store, (state) => state.values.storage);
  if (!isChosenLoaded) {
    return notLoaded;
  }
  return Option.match(settingsFormFor({ storage, type }), {
    onNone: () =>
      StorageSettingsState.Unsupported({
        message: `${unsupportedMediaTypeMessage({ storage, type })} Choose another media type.`,
      }),
    onSome: (settingsForm) =>
      StorageSettingsState.Supported({
        fields: storageSettingsFields({
          settingsForm,
          storagePluginId: storage.storagePluginId,
          type,
        }),
      }),
  });
};

export const useLibraryFormState = (props: Parameters<typeof useLibraryForm>[0]) => {
  const form = useLibraryForm(props);
  const plugin = useStoragePluginLoader({ form, target: props.target });
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const settings = useStorageSettings({ form, isChosenLoaded: plugin.isChosenLoaded });
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  return {
    form,
    plugin,
    isSaving,
    settings,
    editedSettingsFields:
      isEditingSettings && StorageSettingsState.$is('Supported')(settings)
        ? Option.some(settings.fields)
        : Option.none(),
    editSettings: () => {
      setIsEditingSettings(true);
    },
    closeSettings: () => {
      setIsEditingSettings(false);
    },
  };
};

export const useStorageSettingsRow = ({
  form,
  plugin,
  settings,
  onEdit,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly plugin: ReturnType<typeof useStoragePluginLoader>;
  readonly settings: ReturnType<typeof useStorageSettings>;
  readonly onEdit: () => void;
}) => {
  const loading = useSubmitState({ group: plugin.loader });
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const source = useSelector(form.store, (state) => state.values.storageChoice.source);
  const row = StorageSettingsState.$match(settings, {
    NotLoaded: () => ({
      label: 'Load plugin & edit settings',
      enabled: loading.canSubmit && !loading.isSubmitting,
      note: Option.none(),
      prepare: plugin.load,
    }),
    Unsupported: ({ message }) => ({
      label: 'Storage settings',
      enabled: false,
      note: Option.some({ tone: 'critical' as const, message }),
      prepare: async () => false,
    }),
    Supported: () => ({
      label: 'Storage settings',
      enabled: true,
      note: Option.none(),
      prepare: async () => true,
    }),
  });
  return {
    label: row.label,
    isLoading: loading.isSubmitting,
    enabled: !isSaving && row.enabled,
    open: async () => {
      if (await row.prepare()) {
        onEdit();
      }
    },
    notes: Array.getSomes([
      Option.map(loading.errorMessage, (message) => ({ tone: 'critical' as const, message })),
      row.note,
      Match.value(source).pipe(
        Match.when('npm', () =>
          Option.some({ tone: 'secondary' as const, message: npmPluginWarning })
        ),
        Match.when('builtin:local', () => Option.none()),
        Match.exhaustive
      ),
    ]),
  };
};

export type LibraryFormComponent = ComponentType<{
  readonly target: LibraryFormTarget;
  readonly title?: string;
  readonly submitLabel: string;
  readonly onSaved: Parameters<typeof useLibraryForm>[0]['onSaved'];
}>;

export const LibraryFormLoader = ({
  target,
  title,
  children,
}: Pick<ComponentProps<LibraryFormComponent>, 'target' | 'title'> & {
  readonly children: (loaded: LoadedLibraryForm) => ReactElement;
}) => {
  const account = useSelectedAccount();
  const query = libraryFormAtom({ account, id: targetId({ target }) });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const layout = title !== void 0 ? { title, footer: null } : { footer: null };
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <FormLayout {...layout}>
        <ListState kind="loading" />
      </FormLayout>
    ),
    onError: (error) => (
      <FormLayout {...layout}>
        <ListState
          kind="error"
          message={libraryFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      </FormLayout>
    ),
    onDefect: () => (
      <FormLayout {...layout}>
        <ListState
          kind="error"
          message="Unable to load this library’s settings."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </FormLayout>
    ),
    onSuccess: ({ value }) => children(value),
  });
};

export declare const LibraryForm: LibraryFormComponent;
