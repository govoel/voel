import { Button, List, Section } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Option, Record } from 'effect';

import { useStorageList } from '#src/components/library-editor/storage-fields/use-list.ts';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { ListState } from '#src/components/list-state';
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
        {({ item, index }) => (
          <form.AppField
            name={`storagePluginSettings.${descriptor.name}[${index}]`}
            defaultValue={item}>
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

export const StorageFields = ({
  form,
  storage,
}: Pick<ReturnType<typeof useLibraryForm>, 'form' | 'storage'>) =>
  Option.match(storage, {
    onNone: () => null,
    onSome: ({ descriptors, defaultValue }) =>
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
                  {Array.map(group, (descriptor) => {
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
                  })}
                </Section>
              );
            }
          ),
      }),
  });
