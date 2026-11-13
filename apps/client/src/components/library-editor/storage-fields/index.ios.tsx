import { Button, List, Section } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Option, Record } from 'effect';

import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { Text } from '#src/components/text';

const StorageList = ({
  form,
  descriptor,
}: {
  readonly form: ReturnType<typeof useLibraryForm>['form'];
  readonly descriptor: Extract<
    (typeof StoragePluginSettingsForm.Type)[number],
    { kind: 'TextListField' }
  >;
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
        {({ index }) => (
          <form.AppField
            name={`storagePluginSettings.${descriptor.name}[${index}]`}
            defaultValue={Array.getUnsafe(list.field.state.value, index)}>
            {(input) => (
              <input.TextField
                label={descriptor.label}
                placeholder={descriptor.placeholder}
                purpose={descriptor.purpose}
              />
            )}
          </form.AppField>
        )}
      </List.ForEach>
      <Button onPress={list.handleAdd} modifiers={[disabled(list.submitting)]}>
        <Text>Add entry</Text>
      </Button>
    </>
  );
};

export const StorageFields = ({
  form,
  storage,
}: Pick<ReturnType<typeof useLibraryForm>, 'form' | 'storage'>) =>
  Option.match(storage, {
    onNone: () => null,
    onSome: ({ key, descriptors, defaultValue, validators }) => (
      <form.FormGroup
        key={key}
        name="storagePluginSettings"
        defaultValue={defaultValue}
        validators={validators}>
        {() =>
          Array.map(descriptors, (descriptor) => {
            // Group defaults are installed on mount; native inputs need their first-render value too.
            const initialValue =
              form.state.values.storagePluginSettings[descriptor.name] ??
              Option.getOrThrow(Record.get(defaultValue, descriptor.name));
            return Match.value(descriptor).pipe(
              Match.when({ kind: 'TextField' }, (field) => (
                <Section key={field.name}>
                  <form.AppField
                    name={`storagePluginSettings.${field.name}`}
                    defaultValue={initialValue}>
                    {(input) => (
                      <input.TextField
                        label={field.label}
                        placeholder={field.placeholder}
                        purpose={field.purpose}
                      />
                    )}
                  </form.AppField>
                </Section>
              )),
              Match.when({ kind: 'TextListField' }, (field) => (
                <Section key={field.name} title={field.label}>
                  <form.AppField
                    name={`storagePluginSettings.${field.name}`}
                    mode="array"
                    defaultValue={initialValue}>
                    {() => <StorageList form={form} descriptor={field} />}
                  </form.AppField>
                </Section>
              )),
              Match.exhaustive
            );
          })
        }
      </form.FormGroup>
    ),
  });
