import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import type { MediaType } from '@govoel/plugins/library';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { StoragePluginSettingsForms } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import {
  Array,
  Boolean,
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
  pipe,
} from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';
import { useState } from 'react';
import type { ComponentProps, ComponentType, ReactElement } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm, useAppFormGroup } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  StorageSource,
  createLibrary,
  libraryFormAtom,
  loadStoragePlugin,
  mediaTypeLabel,
  mediaTypes,
  storageSourceLabel,
  updateLibrary,
} from '#src/domains/library/management.ts';

type StoragePluginId = typeof Library.jsonCreate.fields.storagePluginId.Type;

export type LibraryFormComponent = ComponentType<{
  readonly id: Option.Option<typeof Library.fields.id.Type>;
  readonly title?: string;
  readonly submitLabel: string;
  readonly onSaved: (library: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}>;

class PluginChoice extends Schema.Struct({
  source: StorageSource,
  packageName: Schema.String,
}).check(
  Schema.makeFilter(({ source, packageName }) =>
    Match.value(source).pipe(
      Match.literalsExhaustive({
        'builtin:local': () => true,
        npm: () =>
          String.isNonEmpty(String.trim(packageName)) || {
            path: ['packageName'],
            issue: 'Enter a package name',
          },
      })
    )
  )
) {
  public static readonly storagePluginId = this.pipe(
    Schema.decodeTo(Library.jsonCreate.fields.storagePluginId, {
      decode: SchemaGetter.transform(({ source, packageName }) =>
        Match.value(source).pipe(
          Match.literalsExhaustive({
            'builtin:local': () => 'builtin:local' as const,
            npm: () => `npm:${String.trim(packageName)}` as const,
          })
        )
      ),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );

  public static readonly decodeStoragePluginId = Schema.decodeOption(this.storagePluginId);

  public static readonly of = ({
    storagePluginId,
  }: {
    readonly storagePluginId: StoragePluginId;
  }) =>
    Match.value(storagePluginId).pipe(
      Match.when('builtin:local', () => ({ source: 'builtin:local' as const, packageName: '' })),
      Match.when(NpmPluginId.is, (id) => ({
        source: 'npm' as const,
        packageName: pipe(id, String.slice(NpmPluginId.parts[0].length)),
      })),
      Match.exhaustive
    );
}

class SettingsValues extends Schema.Struct({
  text: Schema.Record(Schema.String, Schema.String),
  list: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}) {}

const PluginLoad = Schema.TaggedUnion({
  NotLoaded: {},
  Loaded: {
    storagePluginId: Schema.toType(Library.jsonCreate.fields.storagePluginId),
    forms: Schema.toEncoded(StoragePluginSettingsForms),
    settings: Schema.Record(Schema.String, SettingsValues),
  },
});

const loadedPlugin = ({
  storagePluginId,
  forms,
}: Effect.Success<ReturnType<typeof loadStoragePlugin>>) =>
  PluginLoad.cases.Loaded.make({
    storagePluginId,
    forms,
    settings: Record.fromEntries(
      Array.map(
        mediaTypes,
        (type) =>
          [
            type,
            Option.match(Option.fromUndefinedOr(forms[type]), {
              onNone: () => ({ text: {}, list: {} }),
              onSome: (form) => {
                const [text, list] = Array.partition(form, (field) =>
                  Match.value(field).pipe(
                    Match.discriminatorsExhaustive('kind')({
                      TextField: ({ name, initialValue }) =>
                        Result.succeed([name, initialValue] as const),
                      TextListField: ({ name, initialValue }) =>
                        Result.fail([
                          name,
                          Array.match(initialValue, {
                            onEmpty: () => [''],
                            onNonEmpty: (values) => values,
                          }),
                        ] as const),
                    })
                  )
                );
                return { text: Record.fromEntries(text), list: Record.fromEntries(list) };
              },
            }),
          ] as const
      )
    ),
  });

type StorageStatus =
  | { readonly _tag: 'NotLoaded' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Failed'; readonly message: string }
  | { readonly _tag: 'Unsupported'; readonly message: string }
  | {
      readonly _tag: 'Ready';
      readonly storagePluginId: StoragePluginId;
      readonly form: typeof StoragePluginSettingsForm.Encoded;
      readonly values: typeof SettingsValues.Type;
    };

const StorageStatus = Data.taggedEnum<StorageStatus>();

const isReady = StorageStatus.$is('Ready');

/** Whether the chosen plugin's settings for the chosen media type can be edited and saved. */
const storageStatus = ({
  storagePluginId,
  type,
  plugin,
  loadError,
}: {
  readonly storagePluginId: StoragePluginId;
  readonly type: typeof MediaType.Encoded;
  readonly plugin: typeof PluginLoad.Type;
  /** Why the chosen plugin couldn't be loaded. */
  readonly loadError: Option.Option<string>;
}) => {
  const notLoaded = () =>
    Option.match(loadError, {
      onNone: () => StorageStatus.NotLoaded(),
      onSome: (message) => StorageStatus.Failed({ message }),
    });
  return PluginLoad.match(plugin, {
    NotLoaded: notLoaded,
    Loaded: (loaded) =>
      loaded.storagePluginId === storagePluginId
        ? Option.match(
            Option.all({
              form: Option.fromUndefinedOr(loaded.forms[type]),
              values: Record.get(loaded.settings, type),
            }),
            {
              onNone: () =>
                StorageStatus.Unsupported({
                  message: `${Match.value(PluginChoice.of(loaded)).pipe(
                    Match.discriminatorsExhaustive('source')({
                      'builtin:local': ({ source }) => storageSourceLabel({ source }),
                      npm: ({ packageName }) => `“${packageName}”`,
                    })
                  )} doesn’t support ${mediaTypeLabel({ type })}. Choose another media type.`,
                }),
              onSome: ({ form, values }) => StorageStatus.Ready({ storagePluginId, form, values }),
            }
          )
        : notLoaded(),
  });
};

class LibraryFormValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Name is required' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  type: Library.jsonCreate.fields.type,
  pluginChoice: PluginChoice.storagePluginId,
  plugin: PluginLoad,
}) {
  public static readonly library = this.pipe(
    Schema.decodeTo(Library.jsonCreate, {
      decode: SchemaGetter.transformEffect(({ name, type, pluginChoice, plugin }, options) =>
        Match.value(
          storageStatus({ storagePluginId: pluginChoice, type, plugin, loadError: Option.none() })
        ).pipe(
          Match.tag('NotLoaded', 'Failed', () =>
            Effect.fail(
              new SchemaIssue.Pointer(
                ['plugin'],
                new SchemaIssue.InvalidValue(
                  { message: 'Load the storage plugin before saving.' },
                  plugin,
                  options
                )
              )
            )
          ),
          Match.tag('Unsupported', ({ message }) =>
            Effect.fail(
              new SchemaIssue.Pointer(
                ['type'],
                new SchemaIssue.InvalidValue({ message }, type, options)
              )
            )
          ),
          Match.tag('Ready', ({ storagePluginId, form, values }) =>
            Effect.succeed({
              name,
              type,
              storagePluginId,
              storagePluginSettings: Record.fromEntries(
                Array.map(form, (field) =>
                  Match.value(field).pipe(
                    Match.discriminatorsExhaustive('kind')({
                      TextField: ({ name: fieldName, initialValue }) =>
                        [
                          fieldName,
                          Option.getOrElse(Record.get(values.text, fieldName), () => initialValue),
                        ] as const,
                      TextListField: ({ name: fieldName }) =>
                        [
                          fieldName,
                          Array.filter(
                            Option.getOrElse(Record.get(values.list, fieldName), () => []),
                            String.isNonEmpty
                          ),
                        ] as const,
                    })
                  )
                )
              ),
            })
          ),
          Match.exhaustive
        )
      ),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );
}

export const sourceOptions = Array.map(StorageSource.literals, (source) => ({
  source,
  label: storageSourceLabel({ source }),
}));

export const mediaTypeOptions = Array.map(mediaTypes, (type) => ({
  type,
  label: mediaTypeLabel({ type }),
}));

export const useLibraryForm = ({
  id,
  initial,
  onSaved,
}: Pick<ComponentProps<LibraryFormComponent>, 'id' | 'onSaved'> & {
  readonly initial: Atom.Success<ReturnType<typeof libraryFormAtom>>;
}) => {
  const account = useSelectedAccount();
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const form = useAppForm({
    schema: LibraryFormValues.library,
    defaultValues: {
      name: initial.name,
      type: initial.type,
      pluginChoice: PluginChoice.of(initial),
      plugin: Result.match(initial.plugin, {
        onSuccess: loadedPlugin,
        onFailure: () => PluginLoad.cases.NotLoaded.make({}),
      }),
    },
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        // Local folders are built in, so choosing them loads them right away.
        if (
          fieldApi.name === 'pluginChoice.source' &&
          formApi.state.values.pluginChoice.source === 'builtin:local' &&
          needsLoad(formApi.state.values)
        ) {
          void pluginLoader.handleSubmit();
        }
      },
    },
    onSubmit: ({ value: library }) =>
      Option.match(id, {
        onNone: () => createLibrary({ account, library }),
        onSome: (libraryId) => updateLibrary({ account, id: libraryId, library }),
      }),
    onFailure: libraryFailureMessage,
    onSuccess: async ({ result }) => onSaved({ id: result.id }),
  });
  const pluginLoader = useAppFormGroup({
    form,
    name: 'pluginChoice',
    schema: PluginChoice.storagePluginId,
    onSubmit: ({ value }) => loadStoragePlugin({ account, id, storagePluginId: value }),
    onFailure: libraryFailureMessage,
    onSuccess: ({ result }) => {
      form.setFieldValue('plugin', loadedPlugin(result));
    },
  });
  const pluginLoadError = useAtomValue(pluginLoader.submissionError);
  // Unlike a failed load, which clears once the choice changes, this is part of the saved library.
  const savedPluginLoadError = Option.map(Result.getFailure(initial.plugin), (error) =>
    libraryFailureMessage({ error })
  );
  const statusOf = ({
    pluginChoice,
    type,
    plugin,
  }: Pick<typeof LibraryFormValues.Encoded, 'pluginChoice' | 'type' | 'plugin'>) =>
    Option.match(PluginChoice.decodeStoragePluginId(pluginChoice), {
      onNone: () => StorageStatus.NotLoaded(),
      onSome: (storagePluginId) =>
        storageStatus({
          storagePluginId,
          type,
          plugin,
          loadError: Option.orElse(pluginLoadError, () =>
            Option.filter(savedPluginLoadError, () => storagePluginId === initial.storagePluginId)
          ),
        }),
    });
  const needsLoad = (values: Parameters<typeof statusOf>[0]) =>
    Match.value(statusOf(values)).pipe(
      Match.tagsExhaustive({
        NotLoaded: () => true,
        Failed: () => true,
        Unsupported: () => false,
        Ready: () => false,
      })
    );
  const values = useSelector(form.store, (state) => state.values);
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const isLoadingPlugin = pluginLoader.state.meta.isSubmitting;
  const canLoadPlugin = !isSaving && pluginLoader.state.meta.canSubmit;
  const status: StorageStatus = Boolean.match(isLoadingPlugin, {
    onTrue: () => StorageStatus.Loading(),
    onFalse: () => statusOf(values),
  });

  return {
    form,
    isSaving,
    isLoadingPlugin,
    canSave: isReady(status),
    canChooseSource: !isSaving && !isLoadingPlugin,
    settingsButton: StorageStatus.$match(status, {
      NotLoaded: () => ({ label: 'Load plugin & edit settings', enabled: canLoadPlugin }),
      Loading: () => ({ label: 'Load plugin & edit settings', enabled: false }),
      Failed: () => ({ label: 'Load plugin & edit settings', enabled: canLoadPlugin }),
      Unsupported: () => ({ label: 'Storage settings', enabled: false }),
      Ready: () => ({ label: 'Storage settings', enabled: !isSaving }),
    }),
    openSettings: async () => {
      if (needsLoad(form.state.values)) {
        await pluginLoader.handleSubmit();
      }
      setIsEditingSettings(isReady(statusOf(form.state.values)));
    },
    storageNotes: Array.getSomes([
      StorageStatus.$match(status, {
        NotLoaded: () => Option.none(),
        Loading: () => Option.none(),
        Failed: ({ message }) => Option.some({ tone: 'critical' as const, message }),
        Unsupported: ({ message }) => Option.some({ tone: 'critical' as const, message }),
        Ready: () => Option.none(),
      }),
      Match.value(values.pluginChoice.source).pipe(
        Match.literalsExhaustive({
          'builtin:local': () => Option.none(),
          npm: () =>
            Option.some({
              tone: 'secondary' as const,
              message:
                'Loading a plugin downloads it and runs its code on your server. Only use plugins you trust.',
            }),
        })
      ),
    ]),
    settingsSheet: StorageStatus.$match(status, {
      NotLoaded: () => Option.none(),
      Loading: () => Option.none(),
      Failed: () => Option.none(),
      Unsupported: () => Option.none(),
      Ready: ({ form: settingsForm, storagePluginId }) =>
        Option.some({
          fields: Array.map(settingsForm, (field) => ({
            ...field,
            key: `${storagePluginId}.${values.type}.${field.name}`,
            path: Match.value(field).pipe(
              Match.discriminatorsExhaustive('kind')({
                TextField: ({ name }) => `plugin.settings.${values.type}.text.${name}` as const,
                TextListField: ({ name }) => `plugin.settings.${values.type}.list.${name}` as const,
              })
            ),
          })),
          close: () => {
            setIsEditingSettings(false);
          },
        }).pipe(Option.filter(() => isEditingSettings)),
    }),
  };
};

export const LibraryFormLoader = ({
  id,
  title,
  children,
}: Pick<ComponentProps<LibraryFormComponent>, 'id' | 'title'> & {
  readonly children: (initial: Atom.Success<ReturnType<typeof libraryFormAtom>>) => ReactElement;
}) => {
  const account = useSelectedAccount();
  const query = libraryFormAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const layout = title === void 0 ? { footer: null } : { title, footer: null };
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
