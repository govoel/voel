import { Button, List, Section } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Option, Record } from 'effect';
import type { ReactElement } from 'react';

import { withFieldGroup } from '#src/components/form';
import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import { Text } from '#src/components/text';
import { libraryFormDefaults } from '#src/domains/library/editor.ts';

const StorageList = ({
  children,
}: {
  readonly children: (index: number, defaultValue: string) => ReactElement;
}) => {
  const list = useStorageList();
  return (
    <>
      <List.ForEach
        data={list.keys}
        keyExtractor={String}
        recycling={false}
        {...(list.submitting
          ? {}
          : {
              onDelete: (indices: Array<number>) => {
                list.handleRemove({ indices });
              },
            })}>
        {({ index }) => children(index, Array.getUnsafe(list.field.state.value, index))}
      </List.ForEach>
      <Button onPress={list.handleAdd} modifiers={[disabled(list.submitting)]}>
        <Text>Add entry</Text>
      </Button>
    </>
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
          <Section key={field.name}>
            <group.AppField name={field.name} defaultValue={initialValue}>
              {(input) => (
                <input.TextField
                  label={field.label}
                  placeholder={field.placeholder}
                  purpose={field.purpose}
                />
              )}
            </group.AppField>
          </Section>
        )),
        Match.when({ kind: 'TextListField' }, (field) => (
          <Section key={field.name} title={field.label}>
            <group.AppField name={field.name} mode="array" defaultValue={initialValue}>
              {() => (
                <StorageList>
                  {(index, defaultValue) => (
                    <group.AppField name={`${field.name}[${index}]`} defaultValue={defaultValue}>
                      {(input) => (
                        <input.TextField
                          label={field.label}
                          placeholder={field.placeholder}
                          purpose={field.purpose}
                        />
                      )}
                    </group.AppField>
                  )}
                </StorageList>
              )}
            </group.AppField>
          </Section>
        )),
        Match.exhaustive
      );
    });
  },
});
