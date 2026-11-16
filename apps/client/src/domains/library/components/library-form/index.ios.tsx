import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Icon } from '@expo/ui';
import { Button, HStack, Picker, Section, Spacer } from '@expo/ui/swift-ui';
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

const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

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
          <Section title="Storage">
            <form.AppField name="storageChoice.source">
              {(field) => (
                <>
                  <Picker
                    label="Provider"
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
                    <>
                      <form.AppField name="storageChoice.packageName">
                        {(packageField) => (
                          <packageField.TextField
                            purpose="text"
                            label="Package"
                            placeholder="voel-storage-plugin"
                          />
                        )}
                      </form.AppField>
                      <Text variant="caption" modifiers={[secondary]}>
                        {npmPluginWarning}
                      </Text>
                    </>
                  ) : null}
                </>
              )}
            </form.AppField>
            {pending ? (
              <form.SubmitButton group={loader} disabled={isSubmitting}>
                <Text>Load plugin</Text>
              </form.SubmitButton>
            ) : null}
            {Match.value(settings).pipe(
              Match.tagsExhaustive({
                NotLoaded: ({ message }) => <Text modifiers={[secondary]}>{message}</Text>,
                Unsupported: ({ message }) => <Text modifiers={[secondary]}>{message}</Text>,
                Supported: () => null,
              })
            )}
            <Button
              modifiers={[tint('primary'), disabled(settings._tag !== 'Supported' || isSubmitting)]}
              onPress={() => {
                setIsEditingSettings(true);
              }}>
              <HStack>
                <Text>Storage settings</Text>
                <Spacer />
                <Icon
                  name="chevron.right"
                  modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), secondary]}
                />
              </HStack>
            </Button>
          </Section>
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
              modifiers={[pickerStyle('menu'), disabled(isSubmitting)]}>
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
