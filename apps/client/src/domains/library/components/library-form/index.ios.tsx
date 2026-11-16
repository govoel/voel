import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Picker } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled,
  foregroundStyle,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array, Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { ComponentProps } from 'react';

import { AppFormGroup } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import type {
  LibraryFormComponent,
  LoadedLibraryForm,
} from '#src/domains/library/components/library-form/index.tsx';
import {
  libraryFormQuery,
  storagePluginSources,
  useLibraryForm,
  useMediaTypeChoices,
  useStoragePluginLoader,
  useStoragePluginSettingsFields,
} from '#src/domains/library/components/library-form/index.tsx';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

const LibraryFormFields = ({
  loaded,
  target,
  title,
  submitLabel,
  onSaved,
}: ComponentProps<LibraryFormComponent> & { readonly loaded: LoadedLibraryForm }) => {
  const form = useLibraryForm({ loaded, target, onSaved });
  const { loader, pending, choose } = useStoragePluginLoader({ form, target });
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const isLoading = useSelector(loader.store, (state) => state.meta.isSubmitting);
  const mediaTypeChoices = useMediaTypeChoices({ form });
  const settings = useStoragePluginSettingsFields({ form, pending });
  return (
    <form.AppForm>
      <FormLayout
        {...(title !== void 0 ? { title } : {})}
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" placeholder="Movies" />}
        </form.AppField>
        <form.AppField name="type">
          {(field) => (
            <Picker
              label="Media type"
              selection={field.state.value}
              onSelectionChange={(type) => {
                field.handleChange(type);
                field.handleBlur();
              }}
              modifiers={[pickerStyle('menu'), disabled(isSubmitting)]}>
              {Array.map(mediaTypeChoices, (type) => (
                <Text key={type} modifiers={[tag(type)]}>
                  {mediaTypeLabel({ type })}
                </Text>
              ))}
            </Picker>
          )}
        </form.AppField>
        <AppFormGroup group={loader}>
          <form.AppField name="storageChoice.source">
            {(field) => (
              <>
                <Picker
                  label="Storage"
                  selection={field.state.value}
                  onSelectionChange={choose}
                  modifiers={[pickerStyle('menu'), disabled(isSubmitting || isLoading)]}>
                  {Array.map(storagePluginSources, (option) => (
                    <Text key={option.source} modifiers={[tag(option.source)]}>
                      {option.label}
                    </Text>
                  ))}
                </Picker>
                {field.state.value === 'npm' ? (
                  <form.AppField name="storageChoice.packageName">
                    {(packageField) => (
                      <packageField.TextField
                        purpose="text"
                        label="Package"
                        placeholder="voel-storage-plugin"
                      />
                    )}
                  </form.AppField>
                ) : null}
              </>
            )}
          </form.AppField>
          {pending ? (
            <form.SubmitButton disabled={isSubmitting}>
              <Text>Load plugin</Text>
            </form.SubmitButton>
          ) : null}
        </AppFormGroup>
        {Match.value(settings).pipe(
          Match.tagsExhaustive({
            NotLoaded: ({ message }) => (
              <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                {message}
              </Text>
            ),
            Unsupported: ({ message }) => <Text>{message}</Text>,
            Supported: ({ fields }) =>
              Array.map(fields, (descriptor) =>
                Match.value(descriptor).pipe(
                  Match.discriminatorsExhaustive('kind')({
                    TextField: ({ key, path, label, placeholder, purpose }) => (
                      <form.AppField key={key} name={path}>
                        {(field) => (
                          <field.TextField
                            label={label}
                            placeholder={placeholder}
                            purpose={purpose}
                          />
                        )}
                      </form.AppField>
                    ),
                    TextListField: ({ key, path, label, placeholder, purpose }) => (
                      <form.AppField key={key} name={path}>
                        {(field) => (
                          <field.TextListField
                            label={label}
                            placeholder={placeholder}
                            purpose={purpose}
                          />
                        )}
                      </form.AppField>
                    ),
                  })
                )
              ),
          })
        )}
      </FormLayout>
    </form.AppForm>
  );
};

export const LibraryForm = ((props) => {
  const account = useSelectedAccount();
  const query = libraryFormQuery({ account, target: props.target });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const layout = props.title !== void 0 ? { title: props.title, footer: null } : { footer: null };
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
    onSuccess: ({ value }) => <LibraryFormFields {...props} loaded={value} />,
  });
}) satisfies LibraryFormComponent;
