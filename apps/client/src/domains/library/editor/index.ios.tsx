import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Icon } from '@expo/ui';
import {
  Alert,
  Button,
  HStack,
  List,
  Picker,
  ProgressView,
  Section,
  Spacer,
} from '@expo/ui/swift-ui';
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
import type { ReactNode } from 'react';
import { PlatformColor } from 'react-native';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { libraryEditorAtom } from '#src/domains/library/editor/requests.ts';
import { LibraryEditorSource } from '#src/domains/library/editor/schema.ts';
import { StorageSettings } from '#src/domains/library/editor/storage-settings';
import { StorageState, useLibraryForm } from '#src/domains/library/editor/use-form.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

const LibraryForm = (options: Parameters<typeof useLibraryForm>[0]) => {
  const editor = useLibraryForm(options);
  const { form, storage, plugin } = editor;
  const [sheet, setSheet] = useState<'closed' | 'consent' | 'storage'>('closed');
  return (
    <form.AppForm>
      <Alert
        title="Load external plugin?"
        isPresented={sheet === 'consent' && Option.isSome(plugin.consent)}>
        <Alert.Trigger>
          <FormLayout
            footer={
              <form.SubmitButton
                disabled={!StorageState.$is('Ready')(storage)}
                platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                <Text>
                  {LibraryEditorSource.$match(options.editor.source, {
                    Create: () => 'Create library',
                    Edit: () => 'Save changes',
                  })}
                </Text>
              </form.SubmitButton>
            }
            sections={
              <Section title="Storage">
                <Picker<typeof editor.provider>
                  label="Provider"
                  selection={editor.provider}
                  onSelectionChange={(provider) => {
                    editor.selectProvider({ provider });
                  }}
                  modifiers={[pickerStyle('menu'), disabled(editor.submitting || plugin.loading)]}>
                  <Text modifiers={[tag('local')]}>Local folders</Text>
                  <Text modifiers={[tag('custom')]}>Custom plugin</Text>
                </Picker>
                {editor.provider === 'custom' ? (
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
                {editor.provider === 'custom' && StorageState.$is('NotLoaded')(storage) ? (
                  <Button
                    modifiers={[tint('primary'), disabled(editor.submitting || plugin.loading)]}
                    onPress={() => {
                      if (Option.isSome(plugin.consent)) {
                        setSheet('consent');
                      } else {
                        plugin.load();
                      }
                    }}>
                    <HStack>
                      <Text>Load plugin</Text>
                      <Spacer />
                      {plugin.loading ? <ProgressView /> : null}
                    </HStack>
                  </Button>
                ) : null}
                {Option.match(plugin.error, {
                  onNone: () => null,
                  onSome: (message) => (
                    <Text modifiers={[foregroundStyle(PlatformColor('systemRed'))]}>{message}</Text>
                  ),
                })}
                {StorageState.$is('Unsupported')(storage) ? (
                  <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {`${mediaTypeLabel({ type: Library.fields.type.make(storage.type) })} aren’t supported by this plugin.`}
                  </Text>
                ) : null}
                <Button
                  modifiers={[
                    tint('primary'),
                    disabled(!StorageState.$is('Ready')(storage) || editor.submitting),
                  ]}
                  onPress={() => {
                    setSheet('storage');
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
                <Picker<typeof field.state.value>
                  label="Media type"
                  selection={field.state.value}
                  onSelectionChange={field.handleChange}
                  modifiers={[disabled(editor.submitting), pickerStyle('menu')]}>
                  {Array.map(Library.fields.type.schema.literals, (type) => (
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
            {Option.match(plugin.consent, {
              onNone: () => '',
              onSome: (storagePluginId) =>
                `${storagePluginId}\n\nLoading settings may download and run this plugin on your server with the server process’s permissions. Only continue if you trust its source.\n\nCode may run even if you don’t save the library.`,
            })}
          </Text>
        </Alert.Message>
        <Alert.Actions>
          <Button
            role="cancel"
            onPress={() => {
              setSheet('closed');
            }}>
            <Text>Cancel</Text>
          </Button>
          <Button
            onPress={() => {
              setSheet('closed');
              plugin.load();
            }}>
            <Text>Load plugin</Text>
          </Button>
        </Alert.Actions>
      </Alert>
      {sheet === 'storage' ? (
        <Sheet
          onDismissed={() => {
            setSheet('closed');
          }}>
          {({ dismiss }) =>
            StorageState.$is('Ready')(storage) ? (
              <StorageSettings
                form={form}
                type={storage.type}
                fields={storage.fields}
                onDone={dismiss}
              />
            ) : null
          }
        </Sheet>
      ) : null}
    </form.AppForm>
  );
};

const status = (content: ReactNode) => (
  <List modifiers={[frame({ maxHeight: Infinity })]}>
    <Section>{content}</Section>
  </List>
);

/** Loads the library, if editing, and its plugin's settings forms, then shows the form. */
export const LibraryEditor = ({
  id,
  onSuccess,
}: Omit<Parameters<typeof libraryEditorAtom>[0], 'account'> &
  Pick<Parameters<typeof useLibraryForm>[0], 'onSuccess'>) => {
  const account = useSelectedAccount();
  const query = libraryEditorAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return AsyncResult.matchWithError(state, {
    onInitial: () => status(<ListState kind="loading" />),
    onError: (error) =>
      status(
        <ListState
          kind="error"
          message={libraryFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      ),
    onDefect: () =>
      status(
        <ListState
          kind="error"
          message="Unable to load this library."
          onRetry={refresh}
          retrying={state.waiting}
        />
      ),
    onSuccess: ({ value }) => <LibraryForm editor={value} onSuccess={onSuccess} />,
  });
};
