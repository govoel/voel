import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import {
  Button,
  Column,
  Icon,
  LoadingIndicator,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, size } from '@expo/ui/jetpack-compose/modifiers';
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
  storagePluginSources,
  useLibraryForm,
  useStoragePluginLoader,
  useStoragePluginSettingsFields,
  useStorageSettingsRow,
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

/** Where the library's files are kept, with the row that opens the plugin's settings. */
const StorageSection = ({
  form,
  plugin,
  settings,
  onEdit,
}: Parameters<typeof useStorageSettingsRow>[0]) => {
  const row = useStorageSettingsRow({ form, plugin, settings, onEdit });
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const colors = useMaterialColors();
  return (
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
                  enabled={!isSaving && !row.isLoading}
                  onClick={() => {
                    plugin.choose(option.source);
                  }}>
                  <SegmentedButton.Label>
                    <Text>{option.label}</Text>
                  </SegmentedButton.Label>
                </SegmentedButton>
              ))}
            </SingleChoiceSegmentedButtonRow>
            {field.state.value === 'npm' ? (
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
            ) : null}
          </>
        )}
      </form.AppField>
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <SegmentedList>
          <SegmentedListItem
            index={0}
            count={1}
            enabled={row.enabled}
            onClick={() => {
              void row.open();
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>{row.label}</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              {row.isLoading ? (
                <LoadingIndicator modifiers={[size(24, 24)]} />
              ) : (
                // Untinted, so it takes the row's trailing color, which dims when disabled.
                <Icon source={ChevronRight} size={24} />
              )}
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
        </SegmentedList>
        {Array.map(row.notes, ({ tone, message }) => (
          <Text
            key={message}
            variant="caption"
            color={tone === 'critical' ? colors.error : colors.onSurfaceVariant}
            // Lines up with the row's text, like a text field's supporting text.
            modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
            {message}
          </Text>
        ))}
      </Column>
    </>
  );
};

const LibraryFormFields = ({
  loaded,
  target,
  title,
  submitLabel,
  onSaved,
}: ComponentProps<LibraryFormComponent> & { readonly loaded: LoadedLibraryForm }) => {
  const form = useLibraryForm({ loaded, target, onSaved });
  const plugin = useStoragePluginLoader({ form, target });
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  const settings = useStoragePluginSettingsFields({ form, pending: plugin.pending });
  const [isEditingSettings, setIsEditingSettings] = useState(false);
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
          <StorageSection
            form={form}
            plugin={plugin}
            settings={settings}
            onEdit={() => {
              setIsEditingSettings(true);
            }}
          />
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
                    enabled={!isSaving}
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
