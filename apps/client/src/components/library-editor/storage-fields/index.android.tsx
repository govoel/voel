import Delete from '@expo/material-symbols/delete.xml';
import { Column, Icon, IconButton, Row, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, weight } from '@expo/ui/jetpack-compose/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Option, Record } from 'effect';
import type { ReactNode } from 'react';

import { withFieldGroup } from '#src/components/form';
import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { libraryFormDefaults } from '#src/domains/library/editor.ts';

const StorageList = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: (index: number, defaultValue: string) => ReactNode;
}) => {
  const list = useStorageList();
  return (
    <Column verticalArrangement={{ spacedBy: Spacing.two }}>
      <Text>{label}</Text>
      {Array.map(list.keys, (key, index) => (
        <Row key={key} verticalAlignment="center">
          {children(index, Array.getUnsafe(list.field.state.value, index))}
          <IconButton
            enabled={!list.submitting}
            onClick={() => {
              list.handleRemove({ indices: [index] });
            }}>
            <Icon source={Delete} contentDescription={`Remove ${label} ${index + 1}`} />
          </IconButton>
        </Row>
      ))}
      <TextButton enabled={!list.submitting} onClick={list.handleAdd}>
        <Text>Add entry</Text>
      </TextButton>
    </Column>
  );
};

export const StorageFields = withFieldGroup({
  defaultValues: libraryFormDefaults.storagePluginSettings,
  props: {
    descriptors: [] as typeof StoragePluginSettingsForm.Type,
    defaults: libraryFormDefaults.storagePluginSettings,
  },
  render: function render({ group, descriptors, defaults }) {
    return Array.map(descriptors, (descriptor) => {
      // Group defaults are installed on mount; native inputs need their first-render value too.
      const initialValue = Option.getOrElse(Record.get(group.state.values, descriptor.name), () =>
        Option.getOrThrow(Record.get(defaults, descriptor.name))
      );
      return Match.value(descriptor).pipe(
        Match.when({ kind: 'TextField' }, (field) => (
          <group.AppField key={field.name} name={field.name} defaultValue={initialValue}>
            {(input) => (
              <input.TextField
                label={field.label}
                placeholder={field.placeholder}
                purpose={field.purpose}
                platformProps={{ android: { variant: 'outlined', modifiers: [fillMaxWidth()] } }}
              />
            )}
          </group.AppField>
        )),
        Match.when({ kind: 'TextListField' }, (field) => (
          <group.AppField
            key={field.name}
            name={field.name}
            mode="array"
            defaultValue={initialValue}>
            {() => (
              <StorageList label={field.label}>
                {(index, defaultValue) => (
                  <group.AppField name={`${field.name}[${index}]`} defaultValue={defaultValue}>
                    {(input) => (
                      <input.TextField
                        label={field.label}
                        placeholder={field.placeholder}
                        purpose={field.purpose}
                        platformProps={{ android: { variant: 'outlined', modifiers: [weight(1)] } }}
                      />
                    )}
                  </group.AppField>
                )}
              </StorageList>
            )}
          </group.AppField>
        )),
        Match.exhaustive
      );
    });
  },
});
