import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { useSelector } from '@tanstack/react-form';
import { Array, Match, Option, Struct } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';
import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { MediaTypeField } from '#src/domains/library/editor/media-type-field';
import {
  LibraryEditorValues,
  libraryEditorDefaults,
  supportedMediaTypes,
} from '#src/domains/library/editor/schema.ts';
import { StoragePluginField } from '#src/domains/library/editor/storage-plugin-field';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { saveLibrary, storagePluginSettingsFormsAtom } from '#src/domains/library/management.ts';
import type { serverLibraryAtom } from '#src/domains/library/management.ts';

type LibraryEditorProps = {
  /** The library to edit, or none to create one. */
  readonly library: Option.Option<
    Pick<
      Atom.Success<ReturnType<typeof serverLibraryAtom>>,
      'id' | 'name' | 'type' | 'storagePluginId'
    >
  >;
  /** Saves the library. Shown once the storage plugin's settings have loaded. */
  readonly submitButton: ReactNode;
  readonly onSaved: (library: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
} & Pick<ComponentProps<typeof FormLayout>, 'title'>;

/** The selected plugin, and what was entered so far, which carries over to its form. */
const initialStorage = ({ library }: Pick<LibraryEditorProps, 'library'>) => {
  const draft: Parameters<typeof libraryEditorDefaults>[0]['draft'] = {
    name: Option.match(library, { onNone: () => '', onSome: ({ name }) => name }),
    type: Option.map(library, ({ type }) => type),
  };
  return {
    storagePluginId: Option.some(
      Option.match(library, {
        onNone: () => Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
        onSome: ({ storagePluginId }) => storagePluginId,
      })
    ),
    draft,
  };
};

type StorageProps = LibraryEditorProps & {
  readonly draft: ReturnType<typeof initialStorage>['draft'];
  readonly onStorageChange: (storage: ReturnType<typeof initialStorage>) => void;
};

/** The plugin's settings aren't available: the plugin is being chosen, loading, or failed. */
const PendingEditor = ({
  storagePluginField,
  status,
  ...layout
}: {
  readonly storagePluginField: ReactNode;
  readonly status: ReactNode;
} & Pick<LibraryEditorProps, 'title'>) => (
  <FormLayout
    {...layout}
    footer={null}
    sections={[{ key: 'status', title: 'Library', content: status }]}>
    {storagePluginField}
  </FormLayout>
);

const EditorForm = ({
  library,
  storagePluginId,
  draft,
  mediaTypes,
  submitButton,
  onSaved,
  onStorageChange,
  ...layout
}: StorageProps & {
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
  readonly mediaTypes: Parameters<typeof libraryEditorDefaults>[0]['mediaTypes'];
}) => {
  const account = useSelectedAccount();
  const form = useAppForm({
    schema: LibraryEditorValues,
    defaultValues: libraryEditorDefaults({ draft, storagePluginId, mediaTypes }),
    onSubmit: ({ value }) =>
      saveLibrary({ account, id: Option.map(library, ({ id }) => id), library: value }),
    onFailure: libraryFailureMessage,
    onSuccess: async ({ result }) => onSaved(result),
  });
  const type = useSelector(form.store, (state) => state.values.type);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const settings = Option.match(
    Array.findFirst(mediaTypes, (media) => media.type === type),
    { onNone: () => [], onSome: ({ form: fields }) => fields }
  );
  return (
    <form.AppForm>
      <FormLayout
        {...layout}
        footer={submitButton}
        sections={[
          {
            key: 'library',
            title: 'Library',
            content: (
              <>
                <form.AppField name="name">
                  {(field) => <field.TextField label="Name" placeholder="Movies" />}
                </form.AppField>
                <form.AppField name="type">
                  {() => <MediaTypeField types={Array.map(mediaTypes, (media) => media.type)} />}
                </form.AppField>
              </>
            ),
          },
          ...Array.match(settings, {
            onEmpty: () => [],
            onNonEmpty: (fields) => [
              {
                // Each media type has its own settings, so switching types replaces the fields.
                key: `settings-${type}`,
                title: 'Storage settings',
                content: Array.map(fields, (descriptor) =>
                  Match.value(descriptor).pipe(
                    Match.when({ kind: 'TextField' }, ({ name, label, placeholder, purpose }) => (
                      <form.AppField key={name} name={`storagePluginSettings.${type}.${name}`}>
                        {(field) => (
                          <field.TextField
                            label={label}
                            placeholder={placeholder}
                            purpose={purpose}
                          />
                        )}
                      </form.AppField>
                    )),
                    Match.when(
                      { kind: 'TextListField' },
                      ({ name, label, placeholder, purpose }) => (
                        <form.AppField
                          key={name}
                          name={`storagePluginSettings.${type}.${name}`}
                          mode="array">
                          {(field) => (
                            <field.TextListField
                              label={label}
                              placeholder={placeholder}
                              purpose={purpose}
                            />
                          )}
                        </form.AppField>
                      )
                    ),
                    Match.exhaustive
                  )
                ),
              },
            ],
          }),
        ]}>
        <StoragePluginField
          storagePluginId={Option.some(storagePluginId)}
          disabled={isSubmitting}
          onChange={(next) => {
            const { name, type: selectedType } = form.state.values;
            onStorageChange({
              storagePluginId: next,
              draft: { name, type: Option.some(selectedType) },
            });
          }}
        />
      </FormLayout>
    </form.AppForm>
  );
};

const StorageEditor = ({
  storagePluginId,
  ...props
}: StorageProps & {
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
}) => {
  const account = useSelectedAccount();
  const query = storagePluginSettingsFormsAtom({
    account,
    id: Option.map(props.library, ({ id }) => id),
    storagePluginId,
  });
  const forms = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const pending = (status: ReactNode) => (
    <PendingEditor
      {...Struct.pick(props, ['title'])}
      status={status}
      storagePluginField={
        <StoragePluginField
          storagePluginId={Option.some(storagePluginId)}
          disabled={false}
          onChange={(next) => {
            props.onStorageChange({ storagePluginId: next, draft: props.draft });
          }}
        />
      }
    />
  );
  return AsyncResult.matchWithError(forms, {
    onInitial: () => pending(<ListState kind="loading" />),
    onError: (error) =>
      pending(
        <ListState
          kind="error"
          message={libraryFailureMessage({ error })}
          onRetry={refresh}
          retrying={forms.waiting}
        />
      ),
    onDefect: () =>
      pending(
        <ListState
          kind="error"
          message="Unable to load the storage settings."
          onRetry={refresh}
          retrying={forms.waiting}
        />
      ),
    onSuccess: ({ value }) =>
      Array.match(supportedMediaTypes(value), {
        onEmpty: () =>
          pending(
            <ListState
              kind="message"
              message="This storage plugin doesn’t support any media types."
            />
          ),
        onNonEmpty: (mediaTypes) => (
          <EditorForm {...props} storagePluginId={storagePluginId} mediaTypes={mediaTypes} />
        ),
      }),
  });
};

/**
 * Creates or edits a library. The library form mounts once the selected storage plugin's settings
 * forms load, and remounts for each plugin, carrying over the name and media type.
 */
export const LibraryEditor = (props: LibraryEditorProps) => {
  const [storage, setStorage] = useState(() => initialStorage(props));
  return Option.match(storage.storagePluginId, {
    onNone: () => (
      <PendingEditor
        {...Struct.pick(props, ['title'])}
        status={
          <ListState kind="empty" message="Enter the storage plugin’s npm package, then load it." />
        }
        storagePluginField={
          <StoragePluginField
            storagePluginId={Option.none()}
            disabled={false}
            onChange={(storagePluginId) => {
              setStorage({ ...storage, storagePluginId });
            }}
          />
        }
      />
    ),
    onSome: (storagePluginId) => (
      <StorageEditor
        {...props}
        key={storagePluginId}
        storagePluginId={storagePluginId}
        draft={storage.draft}
        onStorageChange={setStorage}
      />
    ),
  });
};
