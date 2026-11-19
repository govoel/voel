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
import { Array, Match, Option } from 'effect';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import type {
  LibraryFormComponent,
  LibraryFormModel,
} from '#src/domains/library/components/library-form/index.tsx';
import {
  LibraryFormLoader,
  mediaTypeOptions,
  sourceOptions,
  useLibraryForm,
} from '#src/domains/library/components/library-form/index.tsx';

const SettingsSheetContent = ({
  form,
  fields,
  onDone,
}: {
  readonly form: LibraryFormModel['form'];
  readonly fields: Option.Option.Value<LibraryFormModel['settingsSheet']>['fields'];
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
        Array.map(nonEmpty, (settingsField) =>
          Match.value(settingsField).pipe(
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

const StorageSection = ({ model }: { readonly model: LibraryFormModel }) => {
  const { form } = model;
  const colors = useMaterialColors();
  return (
    <>
      <Text variant="h4" modifiers={[padding(0, Spacing.two, 0, 0)]}>
        Storage
      </Text>
      <form.AppField name="pluginChoice.source">
        {(field) => (
          <>
            <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
              {Array.map(sourceOptions, ({ source, label }) => (
                <SegmentedButton
                  key={source}
                  selected={field.state.value === source}
                  enabled={model.canChooseSource}
                  onClick={() => {
                    field.handleChange(source);
                  }}>
                  <SegmentedButton.Label>
                    <Text>{label}</Text>
                  </SegmentedButton.Label>
                </SegmentedButton>
              ))}
            </SingleChoiceSegmentedButtonRow>
            {Match.value(field.state.value).pipe(
              Match.when('builtin:local', () => null),
              Match.when('npm', () => (
                <form.AppField name="pluginChoice.packageName">
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
            enabled={model.settingsButton.enabled}
            onClick={() => {
              void model.openSettings();
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>{model.settingsButton.label}</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              {model.isLoadingPlugin ? (
                <LoadingIndicator modifiers={[size(24, 24)]} />
              ) : (
                <Icon source={ChevronRight} size={24} />
              )}
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
        </SegmentedList>
        {Array.map(model.storageNotes, ({ tone, message }) => (
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

const LoadedLibraryForm = ({
  title,
  submitLabel,
  ...props
}: ComponentProps<LibraryFormComponent> &
  Pick<Parameters<typeof useLibraryForm>[0], 'initial'>) => {
  const model = useLibraryForm(props);
  const { form } = model;
  return (
    <form.AppForm>
      <FormLayout
        {...(title !== void 0 ? { title } : {})}
        footer={
          <form.SubmitButton
            disabled={!model.canSave}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }
        sections={<StorageSection model={model} />}>
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
                {Array.map(mediaTypeOptions, ({ type, label }) => (
                  <SegmentedButton
                    key={type}
                    selected={field.state.value === type}
                    enabled={!model.isSaving}
                    onClick={() => {
                      field.handleChange(type);
                      field.handleBlur();
                    }}>
                    <SegmentedButton.Label>
                      <Text>{label}</Text>
                    </SegmentedButton.Label>
                  </SegmentedButton>
                ))}
              </SingleChoiceSegmentedButtonRow>
            </>
          )}
        </form.AppField>
      </FormLayout>
      {Option.match(model.settingsSheet, {
        onNone: () => null,
        onSome: ({ fields, close }) => (
          <Sheet onDismissed={close}>
            {({ dismiss }) => <SettingsSheetContent form={form} fields={fields} onDone={dismiss} />}
          </Sheet>
        ),
      })}
    </form.AppForm>
  );
};

export const LibraryForm = ((props) => (
  <LibraryFormLoader {...props}>
    {(initial) => <LoadedLibraryForm {...props} initial={initial} />}
  </LibraryFormLoader>
)) satisfies LibraryFormComponent;
