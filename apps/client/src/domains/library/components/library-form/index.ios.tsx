import { Icon } from '@expo/ui';
import { Button, HStack, Picker, ProgressView, Section, Spacer, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled,
  environment,
  font,
  foregroundStyle,
  frame,
  pickerStyle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array, Match } from 'effect';
import type { Data } from 'effect';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
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

const StorageSettingsField = ({
  form,
  descriptor,
}: {
  readonly form: LibraryFormState['form'];
  readonly descriptor: SettingsFields[number];
}) =>
  Match.value(descriptor).pipe(
    Match.discriminatorsExhaustive('kind')({
      TextField: ({ path, label, placeholder, purpose }) => (
        <form.AppField name={path}>
          {(field) => <field.TextField label={label} placeholder={placeholder} purpose={purpose} />}
        </form.AppField>
      ),
      TextListField: ({ path, label, placeholder, purpose }) => (
        <form.AppField name={path}>
          {(field) => (
            <field.TextListField label={label} placeholder={placeholder} purpose={purpose} />
          )}
        </form.AppField>
      ),
    })
  );

/**
 * The selected media type's storage settings. Consecutive text fields share a section, and each
 * list gets its own. The list stays in edit mode, so list entries always show their delete buttons.
 */
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
    platformProps={{ ios: { modifiers: [environment('editMode', 'active')] } }}
    footer={
      <Button
        modifiers={[buttonStyle('borderedProminent')]}
        onPress={() => {
          void onDone();
        }}>
        <Text modifiers={[frame({ maxWidth: Infinity })]}>Done</Text>
      </Button>
    }
    sections={Array.match(fields, {
      onEmpty: () => null,
      onNonEmpty: (nonEmpty) =>
        Array.map(
          Array.groupWith(
            nonEmpty,
            (previous, next) => previous.kind === 'TextField' && next.kind === 'TextField'
          ),
          (group) =>
            Match.value(Array.headNonEmpty(group)).pipe(
              Match.discriminatorsExhaustive('kind')({
                TextListField: (list) => (
                  <StorageSettingsField key={list.key} form={form} descriptor={list} />
                ),
                TextField: ({ key }) => (
                  <Section key={key}>
                    {Array.map(group, (descriptor) => (
                      <StorageSettingsField
                        key={descriptor.key}
                        form={form}
                        descriptor={descriptor}
                      />
                    ))}
                  </Section>
                ),
              })
            )
        ),
    })}>
    {Array.isReadonlyArrayEmpty(fields) ? (
      <ListState kind="empty" message="No settings are required for this plugin." />
    ) : null}
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
  return (
    <Section
      title="Storage"
      footer={Array.match(row.notes, {
        onEmpty: () => null,
        onNonEmpty: (notes) => (
          <VStack alignment="leading" spacing={Spacing.two}>
            {Array.map(notes, ({ tone, message }) => (
              <Text
                key={message}
                variant="caption"
                {...Match.value(tone).pipe(
                  Match.when('critical', () => ({ color: 'red' })),
                  Match.when('secondary', () => ({})),
                  Match.exhaustive
                )}>
                {message}
              </Text>
            ))}
          </VStack>
        ),
      })}>
      <form.AppField name="storageChoice.source">
        {(field) => (
          <>
            <Picker
              label="Provider"
              selection={field.state.value}
              onSelectionChange={(source) => {
                plugin.choose(source);
              }}
              modifiers={[pickerStyle('menu'), disabled(isSaving || row.isLoading)]}>
              {Array.map(storagePluginSources, (option) => (
                <Text key={option.source} modifiers={[tag(option.source)]}>
                  {option.label}
                </Text>
              ))}
            </Picker>
            {Match.value(field.state.value).pipe(
              Match.when('builtin:local', () => null),
              Match.when('npm', () => (
                <form.AppField name="storageChoice.packageName">
                  {(packageField) => (
                    <packageField.TextField
                      purpose="text"
                      label="Package"
                      placeholder="voel-storage-plugin"
                    />
                  )}
                </form.AppField>
              )),
              Match.exhaustive
            )}
          </>
        )}
      </form.AppField>
      <Button
        modifiers={[tint('primary'), disabled(!row.enabled)]}
        onPress={() => {
          void row.open();
        }}>
        <HStack>
          <Text>{row.label}</Text>
          <Spacer />
          {row.isLoading ? (
            <ProgressView />
          ) : (
            <Icon
              name="chevron.right"
              modifiers={[
                font({ textStyle: 'footnote', weight: 'semibold' }),
                // An explicit style isn't dimmed by `disabled`, so it dims along with the row.
                foregroundStyle({
                  type: 'hierarchical',
                  style: row.enabled ? 'secondary' : 'quaternary',
                }),
              ]}
            />
          )}
        </HStack>
      </Button>
    </Section>
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
  const { form, plugin, isSaving, settings, isEditingSettings, editSettings, closeSettings } =
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
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }
        sections={
          <StorageSection form={form} plugin={plugin} settings={settings} onEdit={editSettings} />
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" placeholder="Library name" />}
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
              modifiers={[pickerStyle('menu'), disabled(isSaving)]}>
              {Array.map(mediaTypes, (type) => (
                <Text key={type} modifiers={[tag(type)]}>
                  {mediaTypeLabel({ type })}
                </Text>
              ))}
            </Picker>
          )}
        </form.AppField>
      </FormLayout>
      {isEditingSettings ? (
        <Sheet onDismissed={closeSettings}>
          {({ dismiss }) =>
            // The sheet covers the controls that change the settings, so they stay supported.
            StorageSettingsState.$match(settings, {
              NotLoaded: () => null,
              Unsupported: () => null,
              Supported: ({ fields }) => (
                <StorageSettings form={form} fields={fields} onDone={dismiss} />
              ),
            })
          }
        </Sheet>
      ) : null}
    </form.AppForm>
  );
};

export const LibraryForm = ((props) => (
  <LibraryFormLoader {...props}>
    {(loaded) => <LibraryFormFields {...props} loaded={loaded} />}
  </LibraryFormLoader>
)) satisfies LibraryFormComponent;
