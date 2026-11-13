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
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Match, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useSubmitState } from '#src/components/form/hooks.tsx';
import { useLibraryForm, useStorageListField } from '#src/components/library-editor/use-form.ts';
import type { LibraryForm } from '#src/components/library-editor/use-form.ts';
import { Text } from '#src/components/text';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
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

const StorageList = ({
  editor,
  descriptor,
}: {
  readonly editor: LibraryForm;
  readonly descriptor: Extract<
    (typeof StoragePluginSettingsForm.Type)[number],
    { readonly kind: 'TextListField' }
  >;
}) => {
  const { form } = editor;
  const list = useStorageListField();
  return (
    <>
      <List.ForEach
        data={list.keys}
        keyExtractor={String}
        recycling={false}
        {...(editor.submitting
          ? {}
          : {
              onDelete: (indices: Array<number>) => {
                list.handleRemove({ indices });
              },
            })}>
        {({ index }) => (
          <form.AppField name={`storagePluginSettings.${descriptor.name}[${index}]`}>
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
      <Button onPress={list.handleAdd} modifiers={[disabled(editor.submitting)]}>
        <Text>Add entry</Text>
      </Button>
    </>
  );
};

const StorageFields = ({ editor }: { readonly editor: LibraryForm }) => {
  const { form } = editor;
  return Option.match(editor.fields, {
    onNone: () => null,
    onSome: (fields) =>
      Array.map(fields, (descriptor) =>
        Match.value(descriptor).pipe(
          Match.when({ kind: 'TextField' }, (field) => (
            <Section key={field.name}>
              <form.AppField name={`storagePluginSettings.${field.name}`}>
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
              <form.AppField name={`storagePluginSettings.${field.name}`} mode="array">
                {() => <StorageList editor={editor} descriptor={field} />}
              </form.AppField>
            </Section>
          )),
          Match.exhaustive
        )
      ),
  });
};

const Storage = ({ editor }: { readonly editor: LibraryForm }) => {
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
      {provider === 'local' && !editor.ready && !editor.settings.waiting ? (
        <Section>
          <Button onPress={editor.handleLoad} modifiers={[disabled(!editor.canLoad)]}>
            <Text>Load settings</Text>
          </Button>
        </Section>
      ) : null}
      {editor.settings.waiting ? (
        <Section>
          <ProgressView />
        </Section>
      ) : (
        AsyncResult.matchWithError(editor.settings, {
          onInitial: () => null,
          onSuccess: () => null,
          onError: (error) => (
            <Section>
              <Text>{libraryFailureMessage({ error })}</Text>
            </Section>
          ),
          onDefect: () => (
            <Section>
              <Text>Unable to load storage settings. Try again.</Text>
            </Section>
          ),
        })
      )}
      <StorageFields editor={editor} />
      <SubmissionFeedback />
    </>
  );
};

export const LibraryEditorScreen = ({ source }: { readonly source: LibraryEditorSource }) => {
  const router = useRouter();
  const [savedId, setSavedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  const editor = useLibraryForm({
    source,
    onSuccess: ({ id }) => {
      setSavedId(Option.some(id));
    },
  });
  const { form } = editor;
  const [path, setPath] = useState<Array<string>>([]);
  const external = Option.isSome(editor.pending);
  const title = LibraryEditorSource.$is('Create')(source) ? 'New Library' : 'Edit Library';
  if (Option.isSome(savedId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: savedId.value } }}
      />
    );
  }
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Host style={{ flex: 1 }}>
        <form.AppForm>
          <Alert title="Load external plugin?" isPresented={external}>
            <Alert.Trigger>
              <NavigationStack
                path={path}
                onPathChange={(next) => {
                  if (
                    next.length > 0 &&
                    path.length === 0 &&
                    editor.values.storagePluginId === 'builtin:local' &&
                    !editor.ready
                  ) {
                    editor.handleLoad();
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
                      <Button
                        onPress={() => {
                          router.back();
                        }}>
                        <Text>Cancel</Text>
                      </Button>
                    </ToolbarItem>
                    <ToolbarItem placement="confirmationAction">
                      <Button
                        onPress={() => {
                          void form.handleSubmit();
                        }}
                        modifiers={[disabled(!editor.ready || editor.submitting)]}>
                        <Text>{LibraryEditorSource.$is('Create')(source) ? 'Create' : 'Save'}</Text>
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
              <Text>
                {Option.match(editor.pending, {
                  onNone: () => '',
                  onSome: (request) =>
                    `${request.storagePluginId}\n\nLoading settings may download and run this plugin on your server with the server process’s permissions. Only continue if you trust its source.\n\nCode may run even if you don’t save the library.`,
                })}
              </Text>
            </Alert.Message>
            <Alert.Actions>
              <Button
                role="cancel"
                onPress={() => {
                  editor.handleCancelConsent();
                }}>
                <Text>Cancel</Text>
              </Button>
              <Button onPress={editor.handleApprove}>
                <Text>Load plugin</Text>
              </Button>
            </Alert.Actions>
          </Alert>
        </form.AppForm>
      </Host>
    </>
  );
};
