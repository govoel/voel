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
import { Array, Match, Option } from 'effect';
import type { ComponentProps } from 'react';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import type { LibraryFormComponent } from '#src/domains/library/components/library-form/index.tsx';
import {
  LibraryFormLoader,
  StorageStatus,
  mediaTypeOptions,
  sourceOptions,
  useLibraryForm,
} from '#src/domains/library/components/library-form/index.tsx';

const SettingsRow = ({
  label,
  enabled,
  loading = false,
  onPress,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly loading?: boolean;
  readonly onPress?: () => void;
}) => (
  <Button
    modifiers={[tint('primary'), disabled(!enabled)]}
    {...(onPress === void 0 ? {} : { onPress })}>
    <HStack>
      <Text>{label}</Text>
      <Spacer />
      {loading ? (
        <ProgressView />
      ) : (
        <Icon
          name="chevron.right"
          modifiers={[
            font({ textStyle: 'footnote', weight: 'semibold' }),
            foregroundStyle({
              type: 'hierarchical',
              style: enabled ? 'secondary' : 'quaternary',
            }),
          ]}
        />
      )}
    </HStack>
  </Button>
);

const LoadedLibraryForm = ({
  title,
  submitLabel,
  ...props
}: ComponentProps<LibraryFormComponent> &
  Pick<Parameters<typeof useLibraryForm>[0], 'initial'>) => {
  const model = useLibraryForm(props);
  const { form, status } = model;
  const problem = Match.value(status).pipe(
    Match.tag('Failed', 'Unsupported', ({ message }) => Option.some(message)),
    Match.orElse(() => Option.none())
  );
  return (
    <form.AppForm>
      <FormLayout
        {...(title !== void 0 ? { title } : {})}
        footer={
          <form.SubmitButton
            disabled={!StorageStatus.$is('Ready')(status)}
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }
        sections={
          <Section
            title="Storage"
            footer={
              Option.isNone(problem) && model.source === 'builtin:local' ? null : (
                <VStack alignment="leading" spacing={Spacing.two}>
                  {Option.match(problem, {
                    onNone: () => null,
                    onSome: (message) => (
                      <Text variant="caption" color="red">
                        {message}
                      </Text>
                    ),
                  })}
                  {Match.value(model.source).pipe(
                    Match.literalsExhaustive({
                      'builtin:local': () => null,
                      npm: () => (
                        <Text variant="caption">
                          Loading a plugin downloads it and runs its code on your server. Only use
                          plugins you trust.
                        </Text>
                      ),
                    })
                  )}
                </VStack>
              )
            }>
            <form.AppField name="pluginChoice.source">
              {(field) => (
                <>
                  <Picker
                    label="Provider"
                    selection={field.state.value}
                    onSelectionChange={field.handleChange}
                    modifiers={[pickerStyle('menu'), disabled(model.isSaving)]}>
                    {Array.map(sourceOptions, ({ source, label }) => (
                      <Text key={source} modifiers={[tag(source)]}>
                        {label}
                      </Text>
                    ))}
                  </Picker>
                  {Match.value(field.state.value).pipe(
                    Match.literalsExhaustive({
                      'builtin:local': () => null,
                      npm: () => (
                        <form.AppField name="pluginChoice.packageName">
                          {(packageField) => (
                            <packageField.TextField
                              purpose="text"
                              label="Package"
                              placeholder="voel-storage-plugin"
                            />
                          )}
                        </form.AppField>
                      ),
                    })
                  )}
                </>
              )}
            </form.AppField>
            {StorageStatus.$match(status, {
              NoPackage: () => <SettingsRow label="Load plugin & edit settings" enabled={false} />,
              NotLoaded: (notLoaded) => (
                <SettingsRow
                  label="Load plugin & edit settings"
                  enabled={!model.isSaving}
                  onPress={() => void model.loadSettings(notLoaded)}
                />
              ),
              Loading: () => (
                <SettingsRow label="Load plugin & edit settings" enabled={false} loading />
              ),
              Failed: (failed) => (
                <SettingsRow
                  label="Load plugin & edit settings"
                  enabled={!model.isSaving}
                  onPress={() => void model.loadSettings(failed)}
                />
              ),
              Unsupported: () => <SettingsRow label="Storage settings" enabled={false} />,
              Ready: () => (
                <SettingsRow
                  label="Storage settings"
                  enabled={!model.isSaving}
                  onPress={() => {
                    model.editSettings();
                  }}
                />
              ),
            })}
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
              modifiers={[pickerStyle('menu'), disabled(model.isSaving)]}>
              {Array.map(mediaTypeOptions, ({ type, label }) => (
                <Text key={type} modifiers={[tag(type)]}>
                  {label}
                </Text>
              ))}
            </Picker>
          )}
        </form.AppField>
      </FormLayout>
      {Option.match(model.settingsSheet, {
        onNone: () => null,
        onSome: ({ form: settingsForm, path }) => (
          <Sheet
            onDismissed={() => {
              model.closeSettings();
            }}>
            {({ dismiss }) => (
              <FormLayout
                title="Storage settings"
                platformProps={{ ios: { modifiers: [environment('editMode', 'active')] } }}
                footer={
                  <Button
                    modifiers={[buttonStyle('borderedProminent')]}
                    onPress={() => {
                      void dismiss();
                    }}>
                    <Text modifiers={[frame({ maxWidth: Infinity })]}>Done</Text>
                  </Button>
                }
                sections={Array.match(settingsForm, {
                  onEmpty: () => null,
                  onNonEmpty: (fields) =>
                    Array.map(
                      Array.groupWith(
                        fields,
                        (previous, next) =>
                          previous.kind === 'TextField' && next.kind === 'TextField'
                      ),
                      (group) =>
                        Match.value(Array.headNonEmpty(group)).pipe(
                          Match.discriminatorsExhaustive('kind')({
                            TextListField: ({ name, label, placeholder, purpose }) => (
                              <form.AppField key={name} name={`${path}.${name}`}>
                                {(field) => (
                                  <field.TextListField
                                    label={label}
                                    placeholder={placeholder}
                                    purpose={purpose}
                                  />
                                )}
                              </form.AppField>
                            ),
                            TextField: ({ name: first }) => (
                              <Section key={first}>
                                {Array.map(group, ({ name, label, placeholder, purpose }) => (
                                  <form.AppField key={name} name={`${path}.${name}`}>
                                    {(field) => (
                                      <field.TextField
                                        label={label}
                                        placeholder={placeholder}
                                        purpose={purpose}
                                      />
                                    )}
                                  </form.AppField>
                                ))}
                              </Section>
                            ),
                          })
                        )
                    ),
                })}>
                {Array.match(settingsForm, {
                  onEmpty: () => (
                    <ListState kind="empty" message="No settings are required for this plugin." />
                  ),
                  onNonEmpty: () => null,
                })}
              </FormLayout>
            )}
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
