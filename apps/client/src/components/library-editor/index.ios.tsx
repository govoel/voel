import {
  Alert,
  Button,
  List,
  NavigationDestination,
  NavigationStack,
  Picker,
  Section,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui';
import { disabled, frame, navigationTitle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Array, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useSubmitState } from '#src/components/form/hooks.tsx';
import { StorageFields } from '#src/components/library-editor/storage-fields';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { ListState } from '#src/components/list-state';
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

export const LibraryForm = ({
  source,
  editor,
}: {
  readonly source: LibraryEditorSource;
  readonly editor: ReturnType<typeof useLibraryForm>;
}) => {
  const router = useRouter();
  const { form } = editor;
  const provider = editor.metadata.storagePluginId === 'builtin:local' ? 'local' : 'custom';
  const [path, setPath] = useState<Array<string>>([]);
  const external = Option.isSome(editor.pending);
  const title = LibraryEditorSource.$match(source, {
    Create: () => 'New Library',
    Edit: () => 'Edit Library',
  });
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <form.AppForm>
        <Alert title="Load external plugin?" isPresented={external}>
          <Alert.Trigger>
            <NavigationStack path={path} onPathChange={setPath}>
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
                        <Picker<typeof editor.metadata.type>
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
                    {provider === 'custom' ? (
                      <form.AppField name="storagePluginId">
                        {(field) => (
                          <field.TextField
                            label="Plugin ID"
                            placeholder="npm:@example/storage-plugin@1.2.3"
                            purpose="text"
                          />
                        )}
                      </form.AppField>
                    ) : null}
                    <Button
                      modifiers={[disabled(!editor.canOpenStorage)]}
                      onPress={() => {
                        if (editor.needsConsent) {
                          editor.handleRequestConsent();
                        } else {
                          editor.resetStorage();
                          setPath(['storage']);
                        }
                      }}>
                      <Text>Storage settings</Text>
                    </Button>
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
                      <Text>
                        {LibraryEditorSource.$match(source, {
                          Create: () => 'Create',
                          Edit: () => 'Save',
                        })}
                      </Text>
                    </Button>
                  </ToolbarItem>
                </Toolbar.Content>
              </Toolbar>
              <NavigationDestination value="storage">
                <Toolbar modifiers={[navigationTitle('Storage')]}>
                  <List modifiers={[frame({ maxHeight: Infinity })]}>
                    {editor.settings.waiting ? (
                      <Section>
                        <ListState kind="loading" />
                      </Section>
                    ) : (
                      AsyncResult.matchWithError(editor.settings, {
                        onInitial: () => (
                          <Section>
                            <ListState kind="loading" />
                          </Section>
                        ),
                        onSuccess: () =>
                          path.length > 0 ? (
                            <StorageFields form={form} storage={editor.storage} />
                          ) : null,
                        onError: (error) => (
                          <Section>
                            <ListState
                              kind="error"
                              message={libraryFailureMessage({ error })}
                              onRetry={editor.handleRetry}
                              retrying={editor.settings.waiting}
                            />
                          </Section>
                        ),
                        onDefect: () => (
                          <Section>
                            <ListState
                              kind="error"
                              message="Unable to load storage settings."
                              onRetry={editor.handleRetry}
                              retrying={editor.settings.waiting}
                            />
                          </Section>
                        ),
                      })
                    )}
                    <SubmissionFeedback />
                  </List>
                  <Toolbar.Content>
                    <ToolbarItem placement="confirmationAction">
                      <Button
                        onPress={() => {
                          setPath([]);
                        }}
                        modifiers={[disabled(editor.submitting)]}>
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
            <Button
              onPress={() => {
                editor.handleApprove();
                editor.resetStorage();
                setPath(['storage']);
              }}>
              <Text>Load plugin</Text>
            </Button>
          </Alert.Actions>
        </Alert>
      </form.AppForm>
    </>
  );
};
