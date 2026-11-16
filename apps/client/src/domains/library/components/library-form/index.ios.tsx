import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
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
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
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

const StorageSettingsField = ({
  form,
  descriptor,
}: {
  readonly form: ReturnType<typeof useLibraryForm>;
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
  readonly form: ReturnType<typeof useLibraryForm>;
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
          (group) => {
            const first = Array.headNonEmpty(group);
            return first.kind === 'TextListField' ? (
              <StorageSettingsField key={first.key} form={form} descriptor={first} />
            ) : (
              <Section key={first.key}>
                {Array.map(group, (descriptor) => (
                  <StorageSettingsField key={descriptor.key} form={form} descriptor={descriptor} />
                ))}
              </Section>
            );
          }
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
                {...(tone === 'critical' ? { color: 'red' } : {})}>
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
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
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
