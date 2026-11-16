import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import {
  Button,
  Icon,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array, Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import type {
  LibraryFormComponent,
  LoadedLibraryForm,
} from '#src/domains/library/components/library-form/index.tsx';
import {
  libraryFormQuery,
  npmPluginWarning,
  storagePluginSources,
  useLibraryForm,
  useStoragePluginLoader,
  useStoragePluginSettingsFields,
} from '#src/domains/library/components/library-form/index.tsx';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { mediaTypeLabel, mediaTypes } from '#src/domains/library/management.ts';

type SettingsFields = Extract<
  ReturnType<typeof useStoragePluginSettingsFields>,
  { readonly _tag: 'Supported' }
>['fields'];

/** The selected media type's storage settings, in a sheet of their own. */
const StorageSettings = ({
  form,
  fields,
  onDone,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
  readonly fields: SettingsFields;
  readonly onDone: () => void | Promise<void>;
}) => (
  <FormLayout
    title="Storage settings"
    footer={
      <Button
        modifiers={[fillMaxWidth()]}
        onClick={() => {
          void onDone();
        }}>
        <Text>Done</Text>
      </Button>
    }>
    {Array.match(fields, {
      onEmpty: () => <ListState kind="empty" message="No settings are required for this plugin." />,
      onNonEmpty: (nonEmpty) =>
        Array.map(nonEmpty, (descriptor) =>
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
    })}
  </FormLayout>
);

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
  const settings = useStoragePluginSettingsFields({ form, pending });
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const colors = useMaterialColors();
  return (
    <form.AppForm>
      <FormLayout
        {...(title !== void 0 ? { title } : {})}
        footer={
          <form.SubmitButton
            disabled={settings._tag !== 'Supported'}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }
        sections={
          <>
            <Text variant="h4" modifiers={[padding(0, Spacing.two, 0, 0)]}>
              Storage
            </Text>
            <form.AppField name="storageChoice.source">
              {(field) => (
                <>
                  <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
                    {Array.map(storagePluginSources, (option) => (
                      <SegmentedButton
                        key={option.source}
                        selected={field.state.value === option.source}
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
                  {field.state.value === 'npm' ? (
                    <>
                      <form.AppField name="storageChoice.packageName">
                        {(packageField) => (
                          <packageField.TextField
                            purpose="text"
                            label="Package"
                            placeholder="voel-storage-plugin"
                            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                          />
                        )}
                      </form.AppField>
                      <Text variant="caption" color={colors.onSurfaceVariant}>
                        {npmPluginWarning}
                      </Text>
                    </>
                  ) : null}
                </>
              )}
            </form.AppField>
            {pending ? (
              <form.SubmitButton
                group={loader}
                disabled={isSubmitting}
                platformProps={{ android: { variant: 'text' } }}>
                <Text>Load plugin</Text>
              </form.SubmitButton>
            ) : null}
            {Match.value(settings).pipe(
              Match.tagsExhaustive({
                NotLoaded: ({ message }) => <Text color={colors.onSurfaceVariant}>{message}</Text>,
                Unsupported: ({ message }) => <Text color={colors.error}>{message}</Text>,
                Supported: () => null,
              })
            )}
            <SegmentedList>
              <SegmentedListItem
                index={0}
                count={1}
                enabled={settings._tag === 'Supported' && !isSubmitting}
                onClick={() => {
                  setIsEditingSettings(true);
                }}>
                <SegmentedListItem.HeadlineContent>
                  <Text>Storage settings</Text>
                </SegmentedListItem.HeadlineContent>
                <SegmentedListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </SegmentedListItem.TrailingContent>
              </SegmentedListItem>
            </SegmentedList>
          </>
        }>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              purpose="name"
              label="Name"
              placeholder="Library name"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="type">
          {(field) => (
            <>
              <Text>Media type</Text>
              <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
                {Array.map(mediaTypes, (type) => (
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
      </FormLayout>
      {isEditingSettings ? (
        <Sheet
          onDismissed={() => {
            setIsEditingSettings(false);
          }}>
          {({ dismiss }) =>
            // The sheet covers the controls that change the settings, so they stay supported.
            settings._tag === 'Supported' ? (
              <StorageSettings form={form} fields={settings.fields} onDone={dismiss} />
            ) : null
          }
        </Sheet>
      ) : null}
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
