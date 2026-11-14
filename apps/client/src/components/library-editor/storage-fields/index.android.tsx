import Delete from '@expo/material-symbols/delete.xml';
import { Column, Icon, IconButton, OutlinedButton, Row } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, weight } from '@expo/ui/jetpack-compose/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match } from 'effect';

import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import type { useStorageForm } from '#src/components/library-editor/storage-form/use-form.ts';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const StorageList = ({
  form,
  descriptor,
}: {
  readonly form: ReturnType<typeof useStorageForm>['form'];
  readonly descriptor: Extract<
    (typeof StoragePluginSettingsForm.Type)[number],
    { kind: 'TextListField' }
  >;
}) => {
  const list = useStorageList();
  return (
    <Column verticalArrangement={{ spacedBy: Spacing.two }}>
      <Text>{descriptor.label}</Text>
      {Array.map(list.field.state.value, (_, index) => (
        <Row key={index} verticalAlignment="center">
          <form.AppField name={`${descriptor.name}[${index}]`}>
            {(input) => (
              <input.TextField
                label={descriptor.label}
                labelVisibility="hidden"
                placeholder={descriptor.placeholder}
                purpose={descriptor.purpose}
                platformProps={{ android: { modifiers: [weight(1)] } }}
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
      <OutlinedButton
        modifiers={[fillMaxWidth()]}
        enabled={!list.submitting}
        onClick={() => {
          list.field.pushValue('');
        }}>
        <Text>Add entry</Text>
      </OutlinedButton>
    </Column>
  );
};

export const StorageFields = ({ form, descriptors }: ReturnType<typeof useStorageForm>) =>
  Array.match(descriptors, {
    onEmpty: () => <ListState kind="empty" message="No settings are required for this plugin." />,
    onNonEmpty: (fields) =>
      Array.map(fields, (descriptor) =>
        Match.value(descriptor).pipe(
          Match.when({ kind: 'TextField' }, (field) => (
            <form.AppField key={field.name} name={field.name}>
              {(input) => (
                <input.TextField
                  label={field.label}
                  placeholder={field.placeholder}
                  purpose={field.purpose}
                  platformProps={{
                    android: { modifiers: [fillMaxWidth()] },
                  }}
                />
              )}
            </form.AppField>
          )),
          Match.when({ kind: 'TextListField' }, (field) => (
            <form.AppField key={field.name} name={field.name} mode="array">
              {() => <StorageList form={form} descriptor={field} />}
            </form.AppField>
          )),
          Match.exhaustive
        )
      ),
  });
