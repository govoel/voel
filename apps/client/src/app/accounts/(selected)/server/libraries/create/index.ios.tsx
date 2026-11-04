import {
  Button,
  DisclosureGroup,
  Form,
  Host,
  NavigationStack,
  Section,
  Toolbar,
  ToolbarItem,
  VStack,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  disabled,
  foregroundStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { Array, Option } from 'effect';
import { Stack, useRouter } from 'expo-router';
import { PlatformColor } from 'react-native';

import { useCreateLibraryForm } from '#src/app/accounts/(selected)/server/libraries/create/index.ts';
import { useSubmitState } from '#src/components/form/hooks.tsx';
import { Text } from '#src/components/text';
import { RootFields } from '#src/domains/library/components/root-fields';
import { StoragePluginField } from '#src/domains/library/components/storage-plugin-field';
import { TypeField } from '#src/domains/library/components/type-field';
import { newRootRow } from '#src/domains/library/management.ts';

const SubmitAction = ({ label }: { label: string }) => {
  const { form, canSubmit, isSubmitting } = useSubmitState();
  return (
    <Button
      label={isSubmitting ? 'Working…' : label}
      modifiers={[disabled(!canSubmit || isSubmitting)]}
      onPress={() => {
        void form.handleSubmit();
      }}
    />
  );
};
const Feedback = () => {
  const { errorMessage } = useSubmitState();
  return Option.match(errorMessage, {
    onNone: () => null,
    onSome: (message) => (
      <Section>
        <Text modifiers={[foregroundStyle(PlatformColor('systemRed'))]}>{message}</Text>
      </Section>
    ),
  });
};

export default function CreateLibraryScreen() {
  const router = useRouter();
  const controller = useCreateLibraryForm({
    onSuccess: (id) => {
      router.replace({ pathname: '/accounts/server/libraries/[id]', params: { id: String(id) } });
    },
  });
  const { form } = controller;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Host style={{ flex: 1 }}>
        <form.AppForm>
          <NavigationStack>
            <Toolbar
              modifiers={[navigationTitle('New library'), navigationBarTitleDisplayMode('inline')]}>
              <Form>
                <Section
                  footer={
                    <Text>Nothing is created until you finish configuring the library.</Text>
                  }>
                  <Text>Library setup</Text>
                </Section>
                <Section>
                  <DisclosureGroup
                    isExpanded={!controller.ready || controller.expanded === 'library'}
                    onIsExpandedChange={(open) => {
                      if (open) {
                        controller.handleExpand('library');
                      }
                    }}
                    modifiers={[disabled(controller.busy)]}>
                    <DisclosureGroup.Label>
                      <VStack alignment="leading" spacing={4}>
                        <Text>Library details</Text>
                        <Text variant="caption">
                          {controller.ready
                            ? 'Ready · tap to edit'
                            : 'Name, media type, and plugin'}
                        </Text>
                      </VStack>
                    </DisclosureGroup.Label>
                    <form.AppField name="name">
                      {(field) => (
                        <field.TextField purpose="name" label="Name" placeholder="My library" />
                      )}
                    </form.AppField>
                    <form.AppField name="type">{() => <TypeField />}</form.AppField>
                    <form.AppField name="storagePlugin">
                      {() => <StoragePluginField />}
                    </form.AppField>
                  </DisclosureGroup>
                </Section>
                <Section>
                  <DisclosureGroup
                    label="Storage settings"
                    isExpanded={controller.ready && controller.expanded === 'settings'}
                    onIsExpandedChange={(open) => {
                      if (open) {
                        controller.handleExpand('settings');
                      }
                    }}
                    modifiers={[disabled(!controller.ready || controller.busy)]}>
                    {controller.fields.length === 0 ? (
                      <Text>No additional settings are required for this plugin.</Text>
                    ) : null}
                    {Array.map(controller.fields, (descriptor) => (
                      <form.AppField key={descriptor.name} name={`values.${descriptor.name}`}>
                        {(field) => (
                          <field.TextField
                            label={descriptor.label}
                            placeholder={descriptor.placeholder}
                            {...(descriptor.purpose !== void 0
                              ? { purpose: descriptor.purpose }
                              : {})}
                          />
                        )}
                      </form.AppField>
                    ))}
                  </DisclosureGroup>
                </Section>
                <Section
                  footer={
                    <Text>
                      Folder paths are on your server. Roots are optional and can be edited later.
                    </Text>
                  }>
                  <DisclosureGroup
                    label="Media folders"
                    isExpanded={controller.ready && controller.expanded === 'roots'}
                    onIsExpandedChange={(open) => {
                      if (open) {
                        controller.handleExpand('roots');
                      }
                    }}
                    modifiers={[disabled(!controller.ready || controller.busy)]}>
                    <form.Subscribe selector={(state) => state.values.roots}>
                      {(rows) => (
                        <RootFields
                          rows={rows}
                          onAdd={() => {
                            form.setFieldValue('roots', [...rows, newRootRow()]);
                          }}
                          onRemove={(index) => {
                            form.setFieldValue(
                              'roots',
                              Array.filter(rows, (_, i) => i !== index)
                            );
                          }}
                          renderField={(index) => (
                            <form.AppField name={`roots[${index}].root`}>
                              {(field) => (
                                <field.TextField
                                  label={`Root ${index + 1}`}
                                  placeholder="/media/audiobooks"
                                  platformProps={{
                                    ios: {
                                      modifiers: [
                                        autocorrectionDisabled(),
                                        textInputAutocapitalization('never'),
                                      ],
                                    },
                                  }}
                                />
                              )}
                            </form.AppField>
                          )}
                        />
                      )}
                    </form.Subscribe>
                  </DisclosureGroup>
                </Section>
                <Feedback />
              </Form>
              <Toolbar.Content>
                <ToolbarItem placement="cancellationAction">
                  <Button
                    label="Cancel"
                    modifiers={[disabled(controller.busy)]}
                    onPress={() => {
                      router.back();
                    }}
                  />
                </ToolbarItem>
                <ToolbarItem placement="confirmationAction">
                  <SubmitAction label={controller.primaryLabel} />
                </ToolbarItem>
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </form.AppForm>
      </Host>
    </>
  );
}
