import { Button, List, Section } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, frame } from '@expo/ui/swift-ui/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Schema } from 'effect';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
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
    <>
      <List.ForEach
        data={list.field.state.value}
        keyExtractor={(_, index) => String(index)}
        recycling={false}
        {...(list.submitting
          ? {}
          : {
              onDelete: (indices: Array<number>) => {
                list.handleRemove({ indices });
              },
            })}>
        {({ index }) => (
          <form.AppField name={`storage.settings.${type}.${descriptor.name}[${index}]`}>
            {(input) => (
              <input.TextField
                label={descriptor.label}
                labelVisibility="hidden"
                placeholder={descriptor.placeholder}
                purpose={descriptor.purpose}
              />
            )}
          </form.AppField>
        )}
      </List.ForEach>
      <Button
        onPress={() => {
          list.field.pushValue('');
        }}
        modifiers={[disabled(list.submitting)]}>
        <Text>Add entry</Text>
      </Button>
    </>
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
            onPress={() => {
              void group.handleSubmit();
            }}
            modifiers={[buttonStyle('borderedProminent'), disabled(group.state.meta.isSubmitting)]}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>Done</Text>
          </Button>
        }
        sections={Array.match(settings, {
          onEmpty: () => (
            <Section>
              <ListState kind="empty" message="No settings are required for this plugin." />
            </Section>
          ),
          onNonEmpty: (fields) =>
            Array.map(
              Array.groupWith(
                fields,
                (previous, next) => previous.kind === 'TextField' && next.kind === 'TextField'
              ),
              (fieldGroup) => {
                const first = Array.headNonEmpty(fieldGroup);
                return (
                  <Section
                    key={first.name}
                    header={first.kind === 'TextListField' ? <Text>{first.label}</Text> : null}>
                    {Array.map(fieldGroup, (descriptor) =>
                      Match.value(descriptor).pipe(
                        Match.when({ kind: 'TextField' }, (field) => (
                          <form.AppField
                            key={field.name}
                            name={`storage.settings.${type}.${field.name}`}>
                            {(input) => (
                              <input.TextField
                                label={field.label}
                                placeholder={field.placeholder}
                                purpose={field.purpose}
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
                    )}
                  </Section>
                );
              }
            ),
        })}
      />
    )}
  </form.FormGroup>
);
