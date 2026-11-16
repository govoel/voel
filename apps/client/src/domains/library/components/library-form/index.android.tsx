import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array, Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
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
  const { loader, pending, choose } = useStoragePluginLoader({ form, loaded, target });
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const isLoading = useSelector(loader.store, (state) => state.isSubmitting);
  const source = useSelector(loader.store, (state) => state.values.source);
  const mediaTypeChoices = useMediaTypeChoices({ form });
  const settings = useStoragePluginSettingsFields({ form, pending });
  const colors = useMaterialColors();
  return (
    <form.AppForm>
      <FormLayout
        {...(title !== void 0 ? { title } : {})}
        footer={
          <form.SubmitButton
            disabled={pending}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              purpose="name"
              label="Name"
              placeholder="Movies"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="type">
          {(field) => (
            <>
              <Text>Media type</Text>
              <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
                {Array.map(mediaTypeChoices, (type) => (
                  <SegmentedButton
                    key={type}
                    selected={field.state.value === type}
                    enabled={!isSubmitting}
                    onClick={() => {
                      field.handleChange(type);
                      field.handleBlur();
                    }}>
                    <SegmentedButton.Label>
                      <Text>{mediaTypeLabel({ type })}</Text>
                    </SegmentedButton.Label>
                  </SegmentedButton>
                ))}
              </SingleChoiceSegmentedButtonRow>
            </>
          )}
        </form.AppField>
        <Text>Storage</Text>
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {Array.map(storagePluginSources, (option) => (
            <SegmentedButton
              key={option.source}
              selected={source === option.source}
              enabled={!isSubmitting && !isLoading}
              onClick={() => {
                choose(option.source);
              }}>
              <SegmentedButton.Label>
                <Text>{option.label}</Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
        <loader.AppForm>
          {source === 'npm' ? (
            <loader.AppField name="packageName">
              {(field) => (
                <field.TextField
                  purpose="text"
                  label="Package"
                  placeholder="voel-storage-plugin"
                  platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                />
              )}
            </loader.AppField>
          ) : null}
          {pending ? (
            <loader.SubmitButton
              disabled={isSubmitting}
              platformProps={{ android: { variant: 'text' } }}>
              <Text>Load plugin</Text>
            </loader.SubmitButton>
          ) : null}
        </loader.AppForm>
        {Match.value(settings).pipe(
          Match.tagsExhaustive({
            NotLoaded: ({ message }) => <Text color={colors.onSurfaceVariant}>{message}</Text>,
            Unsupported: ({ message }) => <Text color={colors.error}>{message}</Text>,
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
                            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
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
