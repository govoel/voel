import Delete from '@expo/material-symbols/delete.xml';
import { Column, Icon, IconButton, Row, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, weight } from '@expo/ui/jetpack-compose/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Option, Record } from 'effect';

import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

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
    <Column verticalArrangement={{ spacedBy: Spacing.two }}>
      <Text>{descriptor.label}</Text>
      {Array.map(list.keys, (key, index) => (
        <Row key={key} verticalAlignment="center">
          <form.AppField
            name={`storagePluginSettings.${descriptor.name}[${index}]`}
            defaultValue={Array.getUnsafe(list.field.state.value, index)}>
            {(input) => (
              <input.TextField
                label={descriptor.label}
                placeholder={descriptor.placeholder}
                purpose={descriptor.purpose}
                platformProps={{ android: { variant: 'outlined', modifiers: [weight(1)] } }}
              />
            )}
          </form.AppField>
          <IconButton
            enabled={!list.submitting}
            onClick={() => {
              list.handleRemove({ indices: [index] });
            }}>
            <Icon source={Delete} contentDescription={`Remove ${descriptor.label} ${index + 1}`} />
          </IconButton>
        </Row>
      ))}
      <TextButton enabled={!list.submitting} onClick={list.handleAdd}>
        <Text>Add entry</Text>
      </TextButton>
    </Column>
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
                <form.AppField
                  key={field.name}
                  name={`storagePluginSettings.${field.name}`}
                  defaultValue={initialValue}>
                  {(input) => (
                    <input.TextField
                      label={field.label}
                      placeholder={field.placeholder}
                      purpose={field.purpose}
                      platformProps={{
                        android: { variant: 'outlined', modifiers: [fillMaxWidth()] },
                      }}
                    />
                  )}
                </form.AppField>
              )),
              Match.when({ kind: 'TextListField' }, (field) => (
                <form.AppField
                  key={field.name}
                  name={`storagePluginSettings.${field.name}`}
                  mode="array"
                  defaultValue={initialValue}>
                  {() => <StorageList form={form} descriptor={field} />}
                </form.AppField>
              )),
              Match.exhaustive
            );
          })
        }
      </form.FormGroup>
    ),
  });
