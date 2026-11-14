import { Button, List, Section } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match } from 'effect';

import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import type { useStorageForm } from '#src/components/library-editor/storage-form/use-form.ts';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';

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
          <form.AppField name={`${descriptor.name}[${index}]`}>
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

export const StorageFields = ({ form, descriptors }: ReturnType<typeof useStorageForm>) =>
  Array.match(descriptors, {
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
        (group) => {
          const first = Array.headNonEmpty(group);
          return (
            <Section
              key={first.name}
              header={first.kind === 'TextListField' ? <Text>{first.label}</Text> : null}>
              {Array.map(group, (descriptor) =>
                Match.value(descriptor).pipe(
                  Match.when({ kind: 'TextField' }, (field) => (
                    <form.AppField key={field.name} name={field.name}>
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
                    <form.AppField key={field.name} name={field.name} mode="array">
                      {() => <StorageList form={form} descriptor={field} />}
                    </form.AppField>
                  )),
                  Match.exhaustive
                )
              )}
            </Section>
          );
        }
      ),
  });
