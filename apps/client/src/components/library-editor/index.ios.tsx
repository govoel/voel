import {
  Alert,
  Button,
  HStack,
  Host,
  List,
  NavigationDestination,
  NavigationLink,
  NavigationStack,
  Picker,
  ProgressView,
  Section,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui';
import {
  disabled,
  foregroundStyle,
  frame,
  navigationTitle,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Array, Match, Option, Order } from 'effect';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useSubmitState } from '#src/components/form/hooks.tsx';
import { useEditorNavigation } from '#src/components/library-editor/navigation.ts';
import { useLibraryEditor } from '#src/components/library-editor/use-editor.ts';
import type { LibraryEditor } from '#src/components/library-editor/use-editor.ts';
import { Text } from '#src/components/text';
import { newSettingsEntry } from '#src/domains/library/editor.ts';
import type { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

const SubmissionFeedback = () => {
  const { errorMessage } = useSubmitState();
  return Option.match(errorMessage, {
    onNone: () => null,
    onSome: (message) => (
      <Section>
        <Text>{message}</Text>
      </Section>
    ),
  });
};

const StorageFields = ({ editor }: { readonly editor: LibraryEditor }) => {
  const { form } = editor;
  return Option.match(editor.loaded, {
    onNone: () => null,
    onSome: ({ fields }) =>
      editor.ready
        ? Array.map(fields, (descriptor) =>
            Match.value(descriptor).pipe(
              Match.when({ kind: 'TextField' }, (field) => (
                <Section key={field.name}>
                  <form.AppField name={`textValues.${field.name}`}>
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
                  <form.AppField name={`listValues.${field.name}`} mode="array">
                    {(list) => (
                      <>
                        <List.ForEach
                          data={list.state.value}
                          keyExtractor={(entry) => String(entry.key)}
                          recycling={false}
                          {...(editor.submitting
                            ? {}
                            : {
                                onDelete: (indices: Array<number>) => {
                                  for (const index of Array.sort(
                                    indices,
                                    Order.flip(Order.Number)
                                  )) {
                                    list.removeValue(index);
                                  }
                                },
                              })}>
                          {({ index }) => (
                            <form.AppField name={`listValues.${field.name}[${index}].value`}>
                              {(input) => (
                                <input.TextField
                                  label={field.label}
                                  placeholder={field.placeholder}
                                  purpose={field.purpose}
                                />
                              )}
                            </form.AppField>
                          )}
                        </List.ForEach>
                        <Button
                          onPress={() => {
                            list.pushValue(newSettingsEntry({ value: '' }));
                          }}
                          modifiers={[disabled(editor.submitting)]}>
                          <Text>Add entry</Text>
                        </Button>
                      </>
                    )}
                  </form.AppField>
                </Section>
              )),
              Match.exhaustive
            )
          )
        : null,
  });
};

const Storage = ({ editor }: { readonly editor: LibraryEditor }) => {
  const { form } = editor;
  const provider = editor.values.storagePluginId === 'builtin:local' ? 'local' : 'custom';
  return (
    <>
      <Section>
        <Picker<'local' | 'custom'>
          label="Provider"
          selection={provider}
          onSelectionChange={(value) => {
            editor.selectProvider({ provider: value });
          }}
          modifiers={[pickerStyle('menu'), disabled(editor.submitting)]}>
          <Text modifiers={[tag('local')]}>Local folders</Text>
          <Text modifiers={[tag('custom')]}>Custom plugin</Text>
        </Picker>
      </Section>
      {provider === 'custom' ? (
        <Section>
          <form.AppField name="storagePluginId">
            {(field) => (
              <field.TextField
                label="Plugin ID"
                placeholder="npm:@example/storage-plugin@1.2.3"
                purpose="text"
              />
            )}
          </form.AppField>
          <Button onPress={editor.handleLoad} modifiers={[disabled(!editor.canLoad)]}>
            <Text>Load settings</Text>
          </Button>
        </Section>
      ) : null}
      {provider === 'local' && !editor.ready && editor.status._tag !== 'Loading' ? (
        <Section>
          <Button onPress={editor.handleLoad} modifiers={[disabled(!editor.canLoad)]}>
            <Text>Load settings</Text>
          </Button>
        </Section>
      ) : null}
      {Match.value(editor.status).pipe(
        Match.when({ _tag: 'Idle' }, () =>
          !editor.ready && Option.isSome(editor.loaded) ? (
            <Section>
              <Text>Load settings for the current library details before saving.</Text>
            </Section>
          ) : null
        ),
        Match.when({ _tag: 'Loading' }, () => (
          <Section>
            <ProgressView />
          </Section>
        )),
        Match.when({ _tag: 'Failed' }, ({ message }) => (
          <Section>
            <Text>{message}</Text>
            <Button onPress={editor.handleLoad} modifiers={[disabled(!editor.canLoad)]}>
              <Text>Try again</Text>
            </Button>
          </Section>
        )),
        Match.exhaustive
      )}
      <StorageFields editor={editor} />
      <SubmissionFeedback />
    </>
  );
};

export const LibraryEditorScreen = ({ source }: { readonly source: LibraryEditorSource }) => {
  const router = useRouter();
  const editor = useLibraryEditor({
    source,
    onSuccess: ({ id }) => {
      router.dismissTo({ pathname: '/accounts/server/libraries/[id]', params: { id } });
    },
  });
  const guard = useEditorNavigation({ editor });
  const { form } = editor;
  const [path, setPath] = useState<Array<string>>([]);
  const external = Option.isSome(editor.pending);
  const title = source._tag === 'Create' ? 'New Library' : 'Edit Library';
  const message = Option.match(editor.pending, {
    onNone: () => 'Discard unsaved changes to this library?',
    onSome: (request) =>
      `${request.storagePluginId}\n\nLoading settings may download and run this plugin on your server with the server process’s permissions. Only continue if you trust its source.\n\nCode may run even if you don’t save the library.`,
  });
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !editor.submitting }} />
      <Host style={{ flex: 1 }}>
        <form.AppForm>
          <Alert
            title={external ? 'Load external plugin?' : 'Discard changes?'}
            isPresented={external || guard.discarding}>
            <Alert.Trigger>
              <NavigationStack
                path={path}
                onPathChange={(next) => {
                  if (next.length > 0 && path.length === 0) {
                    editor.beginStorageEdit();
                    if (editor.values.storagePluginId === 'builtin:local' && !editor.ready) {
                      editor.handleLoad();
                    }
                  }
                  if (next.length === 0 && path.length > 0) {
                    editor.cancelStorageEdit();
                  }
                  setPath(next);
                }}>
                <Toolbar modifiers={[navigationTitle(title)]}>
                  <List modifiers={[frame({ maxHeight: Infinity })]}>
                    <Section>
                      <form.AppField name="name">
                        {(field) => (
                          <field.TextField label="Name" placeholder="Library name" purpose="name" />
                        )}
                      </form.AppField>
                      <form.AppField name="type">
                        {(field) => (
                          <Picker<typeof editor.values.type>
                            label="Media type"
                            selection={field.state.value}
                            onSelectionChange={field.handleChange}
                            modifiers={[disabled(editor.submitting), pickerStyle('menu')]}>
                            {Array.map(['audiobook', 'movie', 'show'] as const, (type) => (
                              <Text key={type} modifiers={[tag(type)]}>
                                {mediaTypeLabel({ type: Library.fields.type.make(type) })}
                              </Text>
                            ))}
                          </Picker>
                        )}
                      </form.AppField>
                    </Section>
                    <Section title="Storage">
                      <NavigationLink
                        value="storage"
                        modifiers={[disabled(!editor.canEditStorage)]}>
                        <HStack>
                          <Text>Storage</Text>
                          <Text
                            modifiers={[
                              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                            ]}>
                            {editor.values.storagePluginId === 'builtin:local'
                              ? 'Local folders'
                              : 'Custom plugin'}
                          </Text>
                        </HStack>
                      </NavigationLink>
                    </Section>
                    <SubmissionFeedback />
                  </List>
                  <Toolbar.Content>
                    <ToolbarItem placement="cancellationAction">
                      <Button onPress={guard.handleClose} modifiers={[disabled(editor.submitting)]}>
                        <Text>Cancel</Text>
                      </Button>
                    </ToolbarItem>
                    <ToolbarItem placement="confirmationAction">
                      <Button
                        onPress={() => {
                          void form.handleSubmit();
                        }}
                        modifiers={[disabled(!editor.ready || editor.submitting)]}>
                        <Text>{source._tag === 'Create' ? 'Create' : 'Save'}</Text>
                      </Button>
                    </ToolbarItem>
                  </Toolbar.Content>
                </Toolbar>
                <NavigationDestination value="storage">
                  <Toolbar modifiers={[navigationTitle('Storage')]}>
                    <List modifiers={[frame({ maxHeight: Infinity })]}>
                      <Storage editor={editor} />
                    </List>
                    <Toolbar.Content>
                      <ToolbarItem placement="confirmationAction">
                        <Button
                          onPress={() => {
                            editor.acceptStorageEdit();
                            setPath([]);
                          }}
                          modifiers={[disabled(!editor.ready || editor.submitting)]}>
                          <Text>Done</Text>
                        </Button>
                      </ToolbarItem>
                    </Toolbar.Content>
                  </Toolbar>
                </NavigationDestination>
              </NavigationStack>
            </Alert.Trigger>
            <Alert.Message>
              <Text>{message}</Text>
            </Alert.Message>
            <Alert.Actions>
              <Button
                role="cancel"
                onPress={() => {
                  editor.cancelConsent();
                  guard.cancelDiscard();
                }}>
                <Text>Cancel</Text>
              </Button>
              <Button
                {...(external ? {} : { role: 'destructive' as const })}
                onPress={external ? editor.approve : guard.discard}>
                <Text>{external ? 'Load plugin' : 'Discard'}</Text>
              </Button>
            </Alert.Actions>
          </Alert>
        </form.AppForm>
      </Host>
    </>
  );
};
