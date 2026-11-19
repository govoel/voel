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
import type { ComponentProps, ReactElement } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm, useAppFormGroup } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import type { LibraryFormComponent } from '#src/domains/library/components/library-form/index.tsx';
import { LibraryFormTarget } from '#src/domains/library/components/library-form/target.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  createLibrary,
  libraryFormAtom,
  loadStoragePlugin,
  mediaTypeLabel,
  mediaTypeLabels,
  storageSourceLabels,
  updateLibrary,
} from '#src/domains/library/management.ts';

type StoragePluginId = typeof Library.jsonCreate.fields.storagePluginId.Type;
type SettingsForm = typeof StoragePluginSettingsForm.Encoded;
type LoadedPlugin = Effect.Success<ReturnType<typeof loadStoragePlugin>>;

const savedLibraryId = ({ target }: { readonly target: LibraryFormTarget }) =>
  LibraryFormTarget.$match(target, {
    Create: () => Option.none(),
    Edit: ({ id }) => Option.some(id),
  });

const PluginSource = Schema.Literals(Record.keys(storageSourceLabels));

export const pluginSourceOptions = Record.toEntries(storageSourceLabels);

const pluginChoiceFor = ({ storagePluginId }: { readonly storagePluginId: StoragePluginId }) =>
  Match.value(storagePluginId).pipe(
    Match.when('builtin:local', () => ({ source: 'builtin:local' as const, packageName: '' })),
    Match.when(NpmPluginId.is, (id) => ({
      source: 'npm' as const,
      packageName: String.slice(NpmPluginId.parts[0].length)(id),
    })),
    Match.exhaustive
  );

const pluginIdFor = ({
  source,
  packageName,
}: {
  readonly source: typeof PluginSource.Type;
  readonly packageName: string;
}) =>
  Match.value(source).pipe(
    Match.when('builtin:local', (id) => id),
    Match.when('npm', () => `npm:${String.trim(packageName)}` as const),
    Match.exhaustive
  );

class PluginChoice extends Schema.Struct({
  source: PluginSource,
  packageName: Schema.String,
}).check(
  Schema.makeFilter(({ source, packageName }) =>
    Match.value(source).pipe(
      Match.when('builtin:local', () => true),
      Match.when(
        'npm',
        () =>
          String.isNonEmpty(String.trim(packageName)) || {
            path: ['packageName'],
            issue: 'Enter a package name',
          }
      ),
      Match.exhaustive
    )
  )
) {
  public static readonly storagePluginId = this.pipe(
    Schema.decodeTo(Library.jsonCreate.fields.storagePluginId, {
      decode: SchemaGetter.transform(pluginIdFor),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );
}

const unsupportedTypeMessage = ({
  storagePluginId,
  type,
}: {
  readonly storagePluginId: StoragePluginId;
  readonly type: typeof MediaType.Encoded;
}) => {
  const pluginName = Match.value(pluginChoiceFor({ storagePluginId })).pipe(
    Match.discriminatorsExhaustive('source')({
      'builtin:local': () => storageSourceLabels['builtin:local'],
      npm: ({ packageName }) => `“${packageName}”`,
    })
  );
  return `${pluginName} doesn’t support ${mediaTypeLabel({ type })}.`;
};

class SettingsValues extends Schema.Struct({
  text: Schema.Record(Schema.String, Schema.String),
  list: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}) {}

const PluginState = Schema.TaggedUnion({
  NotLoaded: {},
  Loaded: {
    storagePluginId: Schema.toType(Library.jsonCreate.fields.storagePluginId),
    forms: Schema.toEncoded(StoragePluginSettingsForms),
    settings: Schema.Record(Schema.toEncoded(MediaType), SettingsValues),
  },
});

const loadedPlugin = ({
  storagePluginId,
  state,
}: {
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Encoded;
  readonly state: typeof PluginState.Type;
}) =>
  Option.liftPredicate(state, PluginState.isAnyOf(['Loaded'])).pipe(
    Option.filter((loaded) => loaded.storagePluginId === storagePluginId)
  );

const initialSettings = ({ form }: { readonly form: SettingsForm }) => {
  const [text, list] = Array.partition(form, (field) =>
    Match.value(field).pipe(
      Match.discriminatorsExhaustive('kind')({
        TextField: ({ name, initialValue }) => Result.succeed([name, initialValue] as const),
        TextListField: ({ name, initialValue }) =>
          Result.fail([
            name,
            Array.match(initialValue, { onEmpty: () => [''], onNonEmpty: (values) => values }),
          ] as const),
      })
    )
  );
  return { text: Record.fromEntries(text), list: Record.fromEntries(list) };
};

const submittedSettings = ({
  form,
  values,
}: {
  readonly form: SettingsForm;
  readonly values: typeof SettingsValues.Type;
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

const pluginValues = ({ plugin }: { readonly plugin: LoadedPlugin }) =>
  PluginState.cases.Loaded.make({
    ...plugin,
    settings: Record.map(mediaTypeLabels, (_, type) =>
      Option.match(Option.fromUndefinedOr(plugin.forms[type]), {
        onNone: () => ({ text: {}, list: {} }),
        onSome: (form) => initialSettings({ form }),
      })
    ),
  });

const settingsFields = ({
  form,
  storagePluginId,
  type,
}: {
  readonly form: SettingsForm;
  readonly storagePluginId: StoragePluginId;
  readonly type: typeof MediaType.Encoded;
}) =>
  Array.map(form, (field) =>
    Match.value(field).pipe(
      Match.discriminatorsExhaustive('kind')({
        TextField: (descriptor) => ({
          ...descriptor,
          key: `${storagePluginId}.${type}.${descriptor.name}`,
          path: `plugin.settings.${type}.text.${descriptor.name}` as const,
        }),
        TextListField: (descriptor) => ({
          ...descriptor,
          key: `${storagePluginId}.${type}.${descriptor.name}`,
          path: `plugin.settings.${type}.list.${descriptor.name}` as const,
        }),
      })
    )
  );

class LibraryFormValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Name is required' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  type: Library.jsonCreate.fields.type,
  pluginChoice: PluginChoice.storagePluginId,
  plugin: PluginState,
}) {
  public static readonly library = this.pipe(
    Schema.decodeTo(Library.jsonCreate, {
      decode: SchemaGetter.transformEffect(
        Effect.fnUntraced(function* ({ name, type, pluginChoice, plugin: state }, options) {
          const mediaType: typeof MediaType.Encoded = type;
          const plugin = yield* Effect.fromOption(
            loadedPlugin({ storagePluginId: pluginChoice, state }),
            () =>
              new SchemaIssue.Pointer(
                ['plugin'],
                new SchemaIssue.InvalidValue(
                  { message: 'Load the storage plugin before saving.' },
                  state,
                  options
                )
              )
          );
          const form = yield* Effect.fromOption(
            Option.fromUndefinedOr(plugin.forms[mediaType]),
            () =>
              new SchemaIssue.Pointer(
                ['type'],
                new SchemaIssue.InvalidValue(
                  {
                    message: unsupportedTypeMessage({
                      storagePluginId: plugin.storagePluginId,
                      type,
                    }),
                  },
                  type,
                  options
                )
              )
          );
          return {
            name,
            type,
            storagePluginId: plugin.storagePluginId,
            storagePluginSettings: submittedSettings({
              form,
              values: plugin.settings[mediaType],
            }),
          };
        })
      ),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );
}

type SettingsStatus = Data.TaggedEnum<{
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- PluginNotLoaded intentionally has no payload.
  PluginNotLoaded: Record<never, never>;
  TypeUnsupported: { readonly message: string };
  Ready: { readonly form: SettingsForm; readonly storagePluginId: StoragePluginId };
}>;

const SettingsStatus = Data.taggedEnum<SettingsStatus>();

const settingsStatus = (
  values: Pick<typeof LibraryFormValues.Encoded, 'type' | 'pluginChoice' | 'plugin'>
) =>
  Option.match(
    loadedPlugin({ storagePluginId: pluginIdFor(values.pluginChoice), state: values.plugin }),
    {
      onNone: () => SettingsStatus.PluginNotLoaded(),
      onSome: ({ storagePluginId, forms }) =>
        Option.match(Option.fromUndefinedOr(forms[values.type]), {
          onNone: () =>
            SettingsStatus.TypeUnsupported({
              message: `${unsupportedTypeMessage({ storagePluginId, type: values.type })} Choose another media type.`,
            }),
          onSome: (form) => SettingsStatus.Ready({ form, storagePluginId }),
        }),
    }
  );

const npmPluginWarning =
  'Loading a plugin downloads it and runs its code on your server. Only use plugins you trust.';

const useLibraryForm = ({
  loaded,
  target,
  onSaved,
}: Pick<ComponentProps<LibraryFormComponent>, 'target' | 'onSaved'> & {
  readonly loaded: Atom.Success<ReturnType<typeof libraryFormAtom>>;
}) => {
  const account = useSelectedAccount();
  const form = useAppForm({
    schema: LibraryFormValues.library,
    defaultValues: {
      name: loaded.name,
      type: loaded.type,
      pluginChoice: pluginChoiceFor(loaded),
      plugin: Result.match(loaded.plugin, {
        onSuccess: (plugin) => pluginValues({ plugin }),
        onFailure: () => PluginState.cases.NotLoaded.make({}),
      }),
    },
    onSubmit: ({ value: library }) =>
      LibraryFormTarget.$match(target, {
        Create: () => createLibrary({ account, library }),
        Edit: ({ id }) => updateLibrary({ account, id, library }),
      }),
    onFailure: libraryFailureMessage,
    onSuccess: async ({ result }) => onSaved({ id: result.id }),
  });
  const pluginLoader = useAppFormGroup({
    form,
    name: 'pluginChoice',
    schema: PluginChoice.storagePluginId,
    onSubmit: ({ value }) =>
      loadStoragePlugin({ account, id: savedLibraryId({ target }), storagePluginId: value }),
    onFailure: libraryFailureMessage,
    onSuccess: ({ result }) => {
      form.setFieldValue('plugin', pluginValues({ plugin: result }));
    },
  });
  const loadError = useAtomValue(pluginLoader.submissionError);
  const isLoadingPlugin = pluginLoader.state.meta.isSubmitting;
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const values = useSelector(form.store, (state) => state.values);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const status = settingsStatus(values);
  const savedPluginError = Result.getFailure(loaded.plugin).pipe(
    Option.filter(
      () =>
        SettingsStatus.$is('PluginNotLoaded')(status) &&
        pluginIdFor(values.pluginChoice) === loaded.storagePluginId
    ),
    Option.map((error) => libraryFailureMessage({ error }))
  );

  return {
    form,
    isSaving,
    canSave: SettingsStatus.$is('Ready')(status),
    isLoadingPlugin,
    canChoosePluginSource: !isSaving && !isLoadingPlugin,
    choosePluginSource: ({ source }: { readonly source: typeof PluginSource.Type }) => {
      form.setFieldValue('pluginChoice.source', source);
      Match.value(source).pipe(
        Match.when('builtin:local', () => {
          SettingsStatus.$match(settingsStatus(form.state.values), {
            PluginNotLoaded: () => void pluginLoader.handleSubmit(),
            TypeUnsupported: () => void 0,
            Ready: () => void 0,
          });
        }),
        Match.when('npm', () => void 0),
        Match.exhaustive
      );
    },
    settingsButtonLabel: SettingsStatus.$match(status, {
      PluginNotLoaded: () => 'Load plugin & edit settings',
      TypeUnsupported: () => 'Storage settings',
      Ready: () => 'Storage settings',
    }),
    canOpenSettings:
      !isSaving &&
      SettingsStatus.$match(status, {
        PluginNotLoaded: () => pluginLoader.state.meta.canSubmit && !isLoadingPlugin,
        TypeUnsupported: () => false,
        Ready: () => true,
      }),
    openSettings: async () => {
      if (SettingsStatus.$is('PluginNotLoaded')(status)) {
        await pluginLoader.handleSubmit();
      }
      SettingsStatus.$match(settingsStatus(form.state.values), {
        PluginNotLoaded: () => void 0,
        TypeUnsupported: () => void 0,
        Ready: () => {
          setIsEditingSettings(true);
        },
      });
    },
    storageNotes: Array.getSomes([
      Option.map(
        Option.orElse(loadError, () => savedPluginError),
        (message) => ({
          tone: 'critical' as const,
          message,
        })
      ),
      SettingsStatus.$match(status, {
        PluginNotLoaded: () => Option.none(),
        TypeUnsupported: ({ message }) => Option.some({ tone: 'critical' as const, message }),
        Ready: () => Option.none(),
      }),
      Match.value(values.pluginChoice.source).pipe(
        Match.when('builtin:local', () => Option.none()),
        Match.when('npm', () =>
          Option.some({ tone: 'secondary' as const, message: npmPluginWarning })
        ),
        Match.exhaustive
      ),
    ]),
    editedSettingsFields: SettingsStatus.$match(status, {
      PluginNotLoaded: () => Option.none(),
      TypeUnsupported: () => Option.none(),
      Ready: ({ form: settingsForm, storagePluginId }) =>
        Option.some(
          settingsFields({
            form: settingsForm,
            storagePluginId,
            type: values.type,
          })
        ).pipe(Option.filter(() => isEditingSettings)),
    }),
    closeSettings: () => {
      setIsEditingSettings(false);
    },
  };
};

export type LibraryFormModel = ReturnType<typeof useLibraryForm>;

const LoadedLibraryForm = ({
  children,
  ...props
}: Parameters<typeof useLibraryForm>[0] & {
  readonly children: (model: LibraryFormModel) => ReactElement;
}) => children(useLibraryForm(props));

export const LibraryFormLoader = ({
  target,
  title,
  onSaved,
  children,
}: Pick<ComponentProps<LibraryFormComponent>, 'target' | 'title' | 'onSaved'> & {
  readonly children: (model: LibraryFormModel) => ReactElement;
}) => {
  const account = useSelectedAccount();
  const query = libraryFormAtom({ account, id: savedLibraryId({ target }) });
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
    onSuccess: ({ value }) => (
      <LoadedLibraryForm loaded={value} target={target} onSaved={onSaved}>
        {children}
      </LoadedLibraryForm>
    ),
  });
};
