import Close from '@expo/material-symbols/close.xml';
import ExpandMore from '@expo/material-symbols/keyboard_arrow_down.xml';
import ExpandLess from '@expo/material-symbols/keyboard_arrow_up.xml';
import {
  Column,
  Host,
  Icon,
  IconButton,
  OutlinedCard,
  Row,
  Surface,
  TopAppBar,
} from '@expo/ui/jetpack-compose';
import {
  clickable,
  fillMaxSize,
  fillMaxWidth,
  imePadding,
  padding,
  semantics,
  verticalScroll,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';
import { Stack, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCreateLibraryForm } from '#src/app/accounts/(selected)/server/libraries/create/index.ts';
import { Text } from '#src/components/text';
import { materialSeedColor, useMaterialColors } from '#src/constants/material.ts';
import { RootFields } from '#src/domains/library/components/root-fields';
import { StoragePluginField } from '#src/domains/library/components/storage-plugin-field';
import { TypeField } from '#src/domains/library/components/type-field';
import { newRootRow } from '#src/domains/library/management.ts';

const Panel = ({
  title,
  summary,
  open,
  enabled,
  onPress,
  children,
}: PropsWithChildren<{
  title: string;
  summary: string;
  open: boolean;
  enabled: boolean;
  onPress: () => void;
}>) => {
  const colors = useMaterialColors();
  return (
    <OutlinedCard
      modifiers={[fillMaxWidth()]}
      border={{ width: 1, color: open ? colors.primary : colors.outlineVariant }}>
      <Column>
        <Row
          modifiers={[
            fillMaxWidth(),
            clickable(() => {
              if (enabled) {
                onPress();
              }
            }),
            padding(16, 16, 16, 16),
            semantics({ contentDescription: title }),
          ]}
          verticalAlignment="center"
          horizontalArrangement={{ spacedBy: 12 }}>
          <Column modifiers={[weight(1)]} verticalArrangement={{ spacedBy: 4 }}>
            <Text>{title}</Text>
            <Text variant="caption" color={colors.onSurfaceVariant}>
              {summary}
            </Text>
          </Column>
          <Icon source={open ? ExpandLess : ExpandMore} size={24} tint={colors.onSurfaceVariant} />
        </Row>
        {open ? (
          <Column modifiers={[padding(16, 0, 16, 16)]} verticalArrangement={{ spacedBy: 16 }}>
            {children}
          </Column>
        ) : null}
      </Column>
    </OutlinedCard>
  );
};

export default function CreateLibraryScreen() {
  const router = useRouter();
  const controller = useCreateLibraryForm({
    onSuccess: (id) => {
      router.replace({ pathname: '/accounts/server/libraries/[id]', params: { id: String(id) } });
    },
  });
  const { form } = controller;
  const insets = useSafeAreaInsets();
  const colors = useMaterialColors();
  return (
    <>
      <Stack.Screen options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Host seedColor={materialSeedColor} style={{ flex: 1 }}>
        <Surface modifiers={[fillMaxSize()]}>
          <form.AppForm>
            <Column modifiers={[fillMaxSize(), imePadding()]}>
              <TopAppBar>
                <TopAppBar.NavigationIcon>
                  <IconButton
                    enabled={!controller.busy}
                    onClick={() => {
                      router.back();
                    }}
                    modifiers={[semantics({ contentDescription: 'Cancel library creation' })]}>
                    <Icon source={Close} size={24} />
                  </IconButton>
                </TopAppBar.NavigationIcon>
                <TopAppBar.Title>
                  <Text>New library</Text>
                </TopAppBar.Title>
              </TopAppBar>
              <Column
                modifiers={[weight(1), verticalScroll(), padding(24, 16, 24, 24)]}
                verticalArrangement={{ spacedBy: 24 }}>
                <Text variant="caption" color={colors.onSurfaceVariant}>
                  Configure storage and folders before creating the library.
                </Text>
                <Panel
                  title="Library details"
                  summary={
                    controller.ready
                      ? 'Ready · tap to edit'
                      : 'Name, media type, and storage plugin'
                  }
                  open={!controller.ready || controller.expanded === 'library'}
                  enabled={!controller.busy}
                  onPress={() => {
                    controller.handleExpand('library');
                  }}>
                  <form.AppField name="name">
                    {(field) => (
                      <field.TextField
                        purpose="name"
                        label="Name"
                        placeholder="My library"
                        platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="type">{() => <TypeField />}</form.AppField>
                  <form.AppField name="storagePlugin">{() => <StoragePluginField />}</form.AppField>
                </Panel>
                <Panel
                  title="Storage settings"
                  summary={
                    controller.ready ? 'Plugin configuration' : 'Choose the library details first'
                  }
                  open={controller.ready && controller.expanded === 'settings'}
                  enabled={controller.ready && !controller.busy}
                  onPress={() => {
                    controller.handleExpand('settings');
                  }}>
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
                          platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                        />
                      )}
                    </form.AppField>
                  ))}
                </Panel>
                <Panel
                  title="Media folders"
                  summary="Add or remove folder roots"
                  open={controller.ready && controller.expanded === 'roots'}
                  enabled={controller.ready && !controller.busy}
                  onPress={() => {
                    controller.handleExpand('roots');
                  }}>
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
                                  android: {
                                    modifiers: [fillMaxWidth()],
                                    keyboardOptions: {
                                      capitalization: 'none',
                                      autoCorrectEnabled: false,
                                    },
                                  },
                                }}
                              />
                            )}
                          </form.AppField>
                        )}
                      />
                    )}
                  </form.Subscribe>
                  <Text variant="caption" color={colors.onSurfaceVariant}>
                    Roots are optional. You can add more from library details later.
                  </Text>
                </Panel>
              </Column>
              <Column modifiers={[padding(24, 12, 24, insets.bottom + 16)]}>
                <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
                  <Text>{controller.primaryLabel}</Text>
                </form.SubmitButton>
              </Column>
            </Column>
          </form.AppForm>
        </Surface>
      </Host>
    </>
  );
}
