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
import { Array, Match, Option } from 'effect';
import type { Data } from 'effect';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import type { LibraryFormComponent } from '#src/domains/library/components/library-form/index.tsx';
import {
  LibraryFormLoader,
  StorageSettingsState,
  storagePluginSources,
  useLibraryFormState,
  useStorageSettingsRow,
} from '#src/domains/library/components/library-form/index.tsx';
import { mediaTypeLabel, mediaTypes } from '#src/domains/library/management.ts';

type LibraryFormState = ReturnType<typeof useLibraryFormState>;

type SettingsFields = Data.TaggedEnum.Value<LibraryFormState['settings'], 'Supported'>['fields'];

const StorageSettings = ({
  form,
  fields,
  onDone,
}: {
  readonly form: LibraryFormState['form'];
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
            {Match.value(field.state.value).pipe(
              Match.when('builtin:local', () => null),
              Match.when('npm', () => (
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
              )),
              Match.exhaustive
            )}
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
                <Icon source={ChevronRight} size={24} />
              )}
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
        </SegmentedList>
        {Array.map(row.notes, ({ tone, message }) => (
          <Text
            key={message}
            variant="caption"
            color={Match.value(tone).pipe(
              Match.when('critical', () => colors.error),
              Match.when('secondary', () => colors.onSurfaceVariant),
              Match.exhaustive
            )}
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
}: ComponentProps<LibraryFormComponent> &
  Pick<Parameters<typeof useLibraryFormState>[0], 'loaded'>) => {
  const { form, plugin, isSaving, settings, editedSettingsFields, editSettings, closeSettings } =
    useLibraryFormState({ loaded, target, onSaved });
  return (
    <form.AppForm>
      <FormLayout
        {...(title !== void 0 ? { title } : {})}
        footer={
          <form.SubmitButton
            disabled={StorageSettingsState.$match(settings, {
              NotLoaded: () => true,
              Unsupported: () => true,
              Supported: () => false,
            })}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }
        sections={
          <StorageSection form={form} plugin={plugin} settings={settings} onEdit={editSettings} />
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
      {Option.match(editedSettingsFields, {
        onNone: () => null,
        onSome: (fields) => (
          <Sheet onDismissed={closeSettings}>
            {({ dismiss }) => <StorageSettings form={form} fields={fields} onDone={dismiss} />}
          </Sheet>
        ),
      })}
    </form.AppForm>
  );
};

export const LibraryForm = ((props) => (
  <LibraryFormLoader {...props}>
    {(loaded) => <LibraryFormFields {...props} loaded={loaded} />}
  </LibraryFormLoader>
)) satisfies LibraryFormComponent;
