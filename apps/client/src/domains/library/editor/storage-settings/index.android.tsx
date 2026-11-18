import Delete from '@expo/material-symbols/delete.xml';
import { Button, Column, Icon, IconButton, OutlinedButton, Row } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, weight } from '@expo/ui/jetpack-compose/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Schema } from 'effect';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { storageSettingsSchema } from '#src/domains/library/editor/schema.ts';
import { useStorageList } from '#src/domains/library/editor/storage-settings/use-list.ts';
import type { StorageState, useLibraryForm } from '#src/domains/library/editor/use-form.ts';

const StorageList = ({
  form,
  type,
  descriptor,
}: Pick<Parameters<typeof StorageSettings>[0], 'form' | 'type'> & {
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
          <form.AppField name={`storage.settings.${type}.${descriptor.name}[${index}]`}>
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

/** Edits the settings for one media type in place. Done only closes once they're valid. */
export const StorageSettings = ({
  form,
  type,
  fields: settings,
  onDone,
}: Pick<ReturnType<typeof StorageState.Ready>, 'type' | 'fields'> & {
  readonly form: ReturnType<typeof useLibraryForm>['form'];
  readonly onDone: () => void | Promise<void>;
}) => (
  <form.FormGroup
    name={`storage.settings.${type}`}
    validators={{ onSubmit: Schema.toStandardSchemaV1(storageSettingsSchema(settings)) }}
    onGroupSubmit={() => {
      void onDone();
    }}>
    {(group) => (
      <FormLayout
        title="Storage"
        footer={
          <Button
            enabled={!group.state.meta.isSubmitting}
            onClick={() => {
              void group.handleSubmit();
            }}
            modifiers={[fillMaxWidth()]}>
            <Text>Done</Text>
          </Button>
        }>
        {Array.match(settings, {
          onEmpty: () => (
            <ListState kind="empty" message="No settings are required for this plugin." />
          ),
          onNonEmpty: (fields) =>
            Array.map(fields, (descriptor) =>
              Match.value(descriptor).pipe(
                Match.when({ kind: 'TextField' }, (field) => (
                  <form.AppField key={field.name} name={`storage.settings.${type}.${field.name}`}>
                    {(input) => (
                      <input.TextField
                        label={field.label}
                        placeholder={field.placeholder}
                        purpose={field.purpose}
                        platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                      />
                    )}
                  </form.AppField>
                )),
                Match.when({ kind: 'TextListField' }, (field) => (
                  <form.AppField
                    key={field.name}
                    name={`storage.settings.${type}.${field.name}`}
                    mode="array">
                    {() => <StorageList form={form} type={type} descriptor={field} />}
                  </form.AppField>
                )),
                Match.exhaustive
              )
            ),
        })}
      </FormLayout>
    )}
  </form.FormGroup>
);
