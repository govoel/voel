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
  mediaTypeOptions,
  sourceOptions,
  useLibraryForm,
} from '#src/domains/library/components/library-form/index.tsx';

const SettingsField = ({
  form,
  field: settingsField,
}: {
  readonly form: ReturnType<typeof useLibraryForm>['form'];
  readonly field: Option.Option.Value<
    ReturnType<typeof useLibraryForm>['settingsSheet']
  >['fields'][number];
}) =>
  Match.value(settingsField).pipe(
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
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>{submitLabel}</Text>
          </form.SubmitButton>
        }
        sections={
          <Section
            title="Storage"
            footer={Array.match(model.storageNotes, {
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
            <form.AppField name="pluginChoice.source">
              {(field) => (
                <>
                  <Picker
                    label="Provider"
                    selection={field.state.value}
                    onSelectionChange={field.handleChange}
                    modifiers={[pickerStyle('menu'), disabled(!model.canChooseSource)]}>
                    {Array.map(sourceOptions, ({ source, label }) => (
                      <Text key={source} modifiers={[tag(source)]}>
                        {label}
                      </Text>
                    ))}
                  </Picker>
                  {Match.value(field.state.value).pipe(
                    Match.when('builtin:local', () => null),
                    Match.when('npm', () => (
                      <form.AppField name="pluginChoice.packageName">
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
              modifiers={[tint('primary'), disabled(!model.settingsButton.enabled)]}
              onPress={() => {
                void model.openSettings();
              }}>
              <HStack>
                <Text>{model.settingsButton.label}</Text>
                <Spacer />
                {model.isLoadingPlugin ? (
                  <ProgressView />
                ) : (
                  <Icon
                    name="chevron.right"
                    modifiers={[
                      font({ textStyle: 'footnote', weight: 'semibold' }),
                      foregroundStyle({
                        type: 'hierarchical',
                        style: model.settingsButton.enabled ? 'secondary' : 'quaternary',
                      }),
                    ]}
                  />
                )}
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
        onSome: ({ fields, close }) => (
          <Sheet onDismissed={close}>
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
                sections={Array.match(fields, {
                  onEmpty: () => null,
                  onNonEmpty: (nonEmpty) =>
                    Array.map(
                      Array.groupWith(
                        nonEmpty,
                        (previous, next) =>
                          previous.kind === 'TextField' && next.kind === 'TextField'
                      ),
                      (group) =>
                        Match.value(Array.headNonEmpty(group)).pipe(
                          Match.discriminatorsExhaustive('kind')({
                            TextListField: (list) => (
                              <SettingsField key={list.key} form={form} field={list} />
                            ),
                            TextField: ({ key }) => (
                              <Section key={key}>
                                {Array.map(group, (field) => (
                                  <SettingsField key={field.key} form={form} field={field} />
                                ))}
                              </Section>
                            ),
                          })
                        )
                    ),
                })}>
                {Array.match(fields, {
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
