import { RegistryContext, useAtomRefresh, useAtomValue } from '@effect/atom-react';
import type { MediaType } from '@govoel/plugins/library';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import {
  Array,
  Data,
  Effect,
  Exit,
  HashSet,
  Match,
  Option,
  Predicate,
  Record,
  Schema,
  SchemaGetter,
  SchemaIssue,
  String,
  pipe,
} from 'effect';
import { Base64Url } from 'effect/encoding';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { useContext, useReducer, useState } from 'react';
import type { ComponentProps, ComponentType, ReactElement } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  StorageSource,
  createLibrary,
  mediaTypeLabel,
  mediaTypes,
  serverLibraryAtom,
  storagePluginFormsAtom,
  storageSourceLabel,
  updateLibrary,
} from '#src/domains/library/management.ts';

type StoragePluginId = typeof Library.jsonCreate.fields.storagePluginId.Type;

type StoragePluginForms = Atom.Success<ReturnType<typeof storagePluginFormsAtom>>;

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

const settingsKey = (storagePluginId: StoragePluginId) => Base64Url.encode(storagePluginId);

const initialSettings = (forms: StoragePluginForms) =>
  Record.fromEntries(
    Array.getSomes(
      Array.map(mediaTypes, (type) =>
        Option.map(
          Option.fromUndefinedOr(forms[type]),
          (form) =>
            [
              type,
              Record.fromEntries(
                Array.map(
                  form,
                  (field) =>
                    [
                      field.name,
                      Match.value(field).pipe(
                        Match.discriminatorsExhaustive('kind')({
                          TextField: ({ initialValue }): string | ReadonlyArray<string> =>
                            initialValue,
                          TextListField: ({ initialValue }) =>
                            Array.match(initialValue, {
                              onEmpty: () => [''],
                              onNonEmpty: (values) => values,
                            }),
                        })
                      ),
                    ] as const
                )
              ),
            ] as const
        )
      )
    )
  );

class LibraryFormValues extends Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Name is required' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.name)
  ),
  type: Library.jsonCreate.fields.type,
  pluginChoice: PluginChoice.storagePluginId,
  settings: Schema.Record(
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Array(Schema.String)]))
    )
  ),
}) {
  public static readonly library = this.pipe(
    Schema.decodeTo(Library.jsonCreate, {
      decode: SchemaGetter.transformEffect(({ name, type, pluginChoice, settings }) =>
        Option.match(
          Option.flatMap(Record.get(settings, settingsKey(pluginChoice)), Record.get(type)),
          {
            onNone: () =>
              Effect.fail(
                new SchemaIssue.InvalidValue({
                  message: 'Load the storage plugin’s settings before saving.',
                })
              ),
            onSome: (values) =>
              Effect.succeed({
                name,
                type,
                storagePluginId: pluginChoice,
                storagePluginSettings: Record.map(values, (value) =>
                  Predicate.isString(value) ? value : Array.filter(value, String.isNonEmpty)
                ),
              }),
          }
        )
      ),
      encode: SchemaGetter.forbiddenEncoding,
    })
  );
}

type StorageStatus =
  | { readonly _tag: 'NoPackage' }
  | { readonly _tag: 'NotLoaded'; readonly storagePluginId: StoragePluginId }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Failed'; readonly storagePluginId: StoragePluginId; readonly message: string }
  | { readonly _tag: 'Unsupported'; readonly message: string }
  | {
      readonly _tag: 'Ready';
      readonly form: typeof StoragePluginSettingsForm.Type;
      readonly path: `settings.${string}.${typeof MediaType.Encoded}`;
    };

export const StorageStatus = Data.taggedEnum<StorageStatus>();

const storageStatus = ({
  pluginChoice,
  type,
  settings,
  requested,
  forms,
}: Pick<typeof LibraryFormValues.Encoded, 'pluginChoice' | 'settings'> & {
  readonly type: typeof MediaType.Encoded;
  readonly requested: HashSet.HashSet<StoragePluginId>;
  readonly forms: AsyncResult.AsyncResult<
    StoragePluginForms,
    Atom.Failure<ReturnType<typeof storagePluginFormsAtom>>
  >;
}): StorageStatus =>
  Option.match(PluginChoice.decodeStoragePluginId(pluginChoice), {
    onNone: () => StorageStatus.NoPackage(),
    onSome: (storagePluginId) => {
      if (!HashSet.has(requested, storagePluginId)) {
        return StorageStatus.NotLoaded({ storagePluginId });
      }
      if (forms.waiting) {
        return StorageStatus.Loading();
      }
      return AsyncResult.matchWithError(forms, {
        onInitial: () => StorageStatus.Loading(),
        onError: (error) =>
          StorageStatus.Failed({ storagePluginId, message: libraryFailureMessage({ error }) }),
        onDefect: () =>
          StorageStatus.Failed({ storagePluginId, message: 'Unable to load this plugin.' }),
        onSuccess: ({ value }) =>
          Option.match(Option.fromUndefinedOr(value[type]), {
            onNone: () =>
              StorageStatus.Unsupported({
                message: `${Match.value(PluginChoice.of({ storagePluginId })).pipe(
                  Match.discriminatorsExhaustive('source')({
                    'builtin:local': ({ source }) => storageSourceLabel({ source }),
                    npm: ({ packageName }) => `“${packageName}”`,
                  })
                )} doesn’t support ${mediaTypeLabel({ type })}. Choose another media type.`,
              }),
            onSome: (form) =>
              Option.match(
                Option.flatMap(
                  Record.get(settings, settingsKey(storagePluginId)),
                  Record.get(type)
                ),
                {
                  onNone: () => StorageStatus.NotLoaded({ storagePluginId }),
                  onSome: () =>
                    StorageStatus.Ready({
                      form,
                      path: `settings.${settingsKey(storagePluginId)}.${type}`,
                    }),
                }
              ),
          }),
      });
    },
  });

const notRequested = Atom.make(
  AsyncResult.initial<StoragePluginForms, Atom.Failure<ReturnType<typeof storagePluginFormsAtom>>>()
);

const libraryFormAtom = Atom.family(
  ({
    account,
    id,
  }: {
    readonly account: AccountKey;
    readonly id: Option.Option<typeof Library.fields.id.Type>;
  }) =>
    Atom.make(
      Effect.fnUntraced(function* (get) {
        const library = yield* Option.match(id, {
          onNone: () => Effect.succeedNone,
          onSome: (libraryId) =>
            get
              .resultOnce(serverLibraryAtom({ account, id: libraryId }), {
                suspendOnWaiting: true,
              })
              .pipe(Effect.asSome),
        });
        const storagePluginId = Option.match(library, {
          onNone: () => Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
          onSome: (saved) => saved.storagePluginId,
        });
        const plugins = yield* Effect.forEach(
          Array.dedupe([
            Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
            storagePluginId,
          ]),
          (pluginId) =>
            get.resultOnce(storagePluginFormsAtom({ account, id, storagePluginId: pluginId })).pipe(
              Effect.option,
              Effect.map((forms) => ({ storagePluginId: pluginId, forms }))
            ),
          { concurrency: 'unbounded' }
        );
        return Option.match(library, {
          onNone: () => ({
            name: '',
            type: Array.findFirst(mediaTypes, (type) =>
              Array.some(plugins, ({ forms }) =>
                Option.exists(forms, (loaded) => loaded[type] !== void 0)
              )
            ).pipe(Option.getOrElse(() => 'movie' as const)),
            storagePluginId,
            plugins,
          }),
          onSome: ({ name, type }) => ({ name, type, storagePluginId, plugins }),
        });
      })
    ).pipe(Atom.withLabel('libraryFormAtom'))
);

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
  const registry = useContext(RegistryContext);
  const formsAtom = (storagePluginId: StoragePluginId) =>
    storagePluginFormsAtom({ account, id, storagePluginId });
  const [requested, request] = useReducer(
    (current: HashSet.HashSet<StoragePluginId>, storagePluginId: StoragePluginId) =>
      HashSet.add(current, storagePluginId),
    HashSet.fromIterable(Array.map(initial.plugins, ({ storagePluginId }) => storagePluginId))
  );
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const form = useAppForm({
    schema: LibraryFormValues.library,
    defaultValues: {
      name: initial.name,
      type: initial.type,
      pluginChoice: PluginChoice.of(initial),
      settings: Record.fromEntries(
        Array.getSomes(
          Array.map(initial.plugins, ({ storagePluginId, forms }) =>
            Option.map(
              forms,
              (loaded) => [settingsKey(storagePluginId), initialSettings(loaded)] as const
            )
          )
        )
      ),
    },
    onSubmit: ({ value: library }) =>
      Option.match(id, {
        onNone: () => createLibrary({ account, library }),
        onSome: (libraryId) => updateLibrary({ account, id: libraryId, library }),
      }),
    onFailure: libraryFailureMessage,
    onSuccess: async ({ result }) => onSaved({ id: result.id }),
  });
  const values = useSelector(form.store, (state) => state.values);
  const chosen = Option.filter(
    PluginChoice.decodeStoragePluginId(values.pluginChoice),
    (pluginId) => HashSet.has(requested, pluginId)
  );
  const status = storageStatus({
    ...values,
    requested,
    forms: useAtomValue(Option.match(chosen, { onNone: () => notRequested, onSome: formsAtom })),
  });

  return {
    form,
    status,
    source: values.pluginChoice.source,
    isSaving: useSelector(form.store, (state) => state.isSubmitting),
    settingsSheet: Option.liftPredicate(status, StorageStatus.$is('Ready')).pipe(
      Option.filter(() => isEditingSettings)
    ),
    editSettings: () => {
      setIsEditingSettings(true);
    },
    closeSettings: () => {
      setIsEditingSettings(false);
    },
    loadSettings: async ({ storagePluginId }: { readonly storagePluginId: StoragePluginId }) => {
      const atom = formsAtom(storagePluginId);
      request(storagePluginId);
      if (AsyncResult.isFailure(registry.get(atom))) {
        registry.refresh(atom);
      }
      const loaded = await Effect.runPromiseExit(
        AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })
      );
      if (Exit.isFailure(loaded)) {
        return;
      }
      const key = settingsKey(storagePluginId);
      if (!Record.has(form.state.values.settings, key)) {
        form.setFieldValue(`settings.${key}`, initialSettings(loaded.value));
      }
      const type: typeof MediaType.Encoded = form.state.values.type;
      setIsEditingSettings(
        loaded.value[type] !== void 0 &&
          Option.contains(
            PluginChoice.decodeStoragePluginId(form.state.values.pluginChoice),
            storagePluginId
          )
      );
    },
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
