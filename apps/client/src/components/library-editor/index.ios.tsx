import { Icon } from '@expo/ui';
import { Alert, Button, HStack, Picker, Section, Spacer } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  pickerStyle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Array, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { FormLayout } from '#src/components/form/layout';
import { StorageFields } from '#src/components/library-editor/storage-fields';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { ListState } from '#src/components/list-state';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

export const LibraryForm = ({
  source,
  editor,
}: {
  readonly source: LibraryEditorSource;
  readonly editor: ReturnType<typeof useLibraryForm>;
}) => {
  const { form } = editor;
  const provider = editor.metadata.storagePluginId === 'builtin:local' ? 'local' : 'custom';
  const [storageOpen, setStorageOpen] = useState(false);
  return (
    <form.AppForm>
      <Alert title="Load external plugin?" isPresented={Option.isSome(editor.pending)}>
        <Alert.Trigger>
          <FormLayout
            footer={
              <form.SubmitButton
                disabled={!editor.ready}
                platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                <Text>
                  {LibraryEditorSource.$match(source, {
                    Create: () => 'Create library',
                    Edit: () => 'Save changes',
                  })}
                </Text>
              </form.SubmitButton>
            }
            sections={
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
                  modifiers={[tint('primary'), disabled(!editor.canOpenStorage)]}
                  onPress={() => {
                    if (editor.needsConsent) {
                      editor.handleRequestConsent();
                    } else {
                      editor.resetStorage();
                      setStorageOpen(true);
                    }
                  }}>
                  <HStack>
                    <Text>Storage settings</Text>
                    <Spacer />
                    <Icon
                      name="chevron.right"
                      modifiers={[
                        font({ textStyle: 'footnote', weight: 'semibold' }),
                        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                      ]}
                    />
                  </HStack>
                </Button>
              </Section>
            }>
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
          </FormLayout>
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
          <Button role="cancel" onPress={editor.handleCancelConsent}>
            <Text>Cancel</Text>
          </Button>
          <Button
            onPress={() => {
              editor.handleApprove();
              editor.resetStorage();
              setStorageOpen(true);
            }}>
            <Text>Load plugin</Text>
          </Button>
        </Alert.Actions>
      </Alert>
      {storageOpen ? (
        <Sheet
          onDismissed={() => {
            setStorageOpen(false);
          }}>
          {({ dismiss }) => (
            <FormLayout
              title="Storage"
              footer={
                <Button
                  onPress={() => {
                    void dismiss();
                  }}
                  modifiers={[disabled(editor.submitting), buttonStyle('borderedProminent')]}>
                  <Text modifiers={[frame({ maxWidth: Infinity })]}>Done</Text>
                </Button>
              }>
              {editor.settings.waiting ? (
                <ListState kind="loading" />
              ) : (
                AsyncResult.matchWithError(editor.settings, {
                  onInitial: () => <ListState kind="loading" />,
                  onSuccess: () => <StorageFields form={form} storage={editor.storage} />,
                  onError: (error) => (
                    <ListState
                      kind="error"
                      message={libraryFailureMessage({ error })}
                      onRetry={editor.handleRetry}
                      retrying={editor.settings.waiting}
                    />
                  ),
                  onDefect: () => (
                    <ListState
                      kind="error"
                      message="Unable to load storage settings."
                      onRetry={editor.handleRetry}
                      retrying={editor.settings.waiting}
                    />
                  ),
                })
              )}
            </FormLayout>
          )}
        </Sheet>
      ) : null}
    </form.AppForm>
  );
};
