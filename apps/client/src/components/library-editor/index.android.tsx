import {
  AlertDialog,
  Button,
  HorizontalDivider,
  LoadingIndicator,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { FormLayout } from '#src/components/form/layout';
import { StorageFields } from '#src/components/library-editor/storage-fields';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
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
  return (
    <form.AppForm>
      <FormLayout
        title={LibraryEditorSource.$is('Create')(source) ? 'New library' : 'Edit library'}
        footer={
          <form.SubmitButton
            disabled={!editor.ready}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>{LibraryEditorSource.$is('Create')(source) ? 'Create library' : 'Save'}</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label="Library name"
              placeholder="Library name"
              purpose="name"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="type">
          {(field) => (
            <>
              <Text>Media type</Text>
              <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
                {Array.map(['audiobook', 'movie', 'show'] as const, (type) => (
                  <SegmentedButton
                    key={type}
                    selected={field.state.value === type}
                    enabled={!editor.submitting}
                    onClick={() => {
                      field.handleChange(type);
                    }}>
                    <SegmentedButton.Label>
                      <Text>{mediaTypeLabel({ type: Library.fields.type.make(type) })}</Text>
                    </SegmentedButton.Label>
                  </SegmentedButton>
                ))}
              </SingleChoiceSegmentedButtonRow>
            </>
          )}
        </form.AppField>
        <HorizontalDivider />
        <Text variant="h4">Storage</Text>
        <Text>Provider</Text>
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {Array.map(
            [
              { value: 'local', label: 'Local folders' },
              { value: 'custom', label: 'Custom plugin' },
            ] as const,
            (option) => (
              <SegmentedButton
                key={option.value}
                selected={provider === option.value}
                enabled={!editor.submitting}
                onClick={() => {
                  editor.selectProvider({ provider: option.value });
                }}>
                <SegmentedButton.Label>
                  <Text>{option.label}</Text>
                </SegmentedButton.Label>
              </SegmentedButton>
            )
          )}
        </SingleChoiceSegmentedButtonRow>
        {provider === 'custom' ? (
          <form.AppField name="storagePluginId">
            {(field) => (
              <field.TextField
                label="Plugin ID"
                placeholder="npm:@example/storage-plugin@1.2.3"
                purpose="text"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>
        ) : null}
        {provider === 'custom' || Option.isNone(editor.storage) ? (
          <Button enabled={editor.canLoad} onClick={editor.handleLoad}>
            <Text>Load settings</Text>
          </Button>
        ) : null}
        {editor.settings.waiting ? (
          <LoadingIndicator />
        ) : (
          AsyncResult.matchWithError(editor.settings, {
            onInitial: () => null,
            onSuccess: () => null,
            onError: (error) => <Text>{libraryFailureMessage({ error })}</Text>,
            onDefect: () => <Text>Unable to load storage settings. Try again.</Text>,
          })
        )}
        <StorageFields form={form} storage={editor.storage} />
      </FormLayout>
      {Option.match(editor.pending, {
        onNone: () => null,
        onSome: (request) => (
          <AlertDialog onDismissRequest={editor.handleCancelConsent}>
            <AlertDialog.Title>
              <Text>Load external plugin?</Text>
            </AlertDialog.Title>
            <AlertDialog.Text>
              <Text>
                {`${request.storagePluginId}\n\nLoading settings may download and run this plugin on your server with the server process’s permissions. Only continue if you trust its source.\n\nCode may run even if you don’t save the library.`}
              </Text>
            </AlertDialog.Text>
            <AlertDialog.DismissButton>
              <TextButton onClick={editor.handleCancelConsent}>
                <Text>Cancel</Text>
              </TextButton>
            </AlertDialog.DismissButton>
            <AlertDialog.ConfirmButton>
              <TextButton onClick={editor.handleApprove}>
                <Text>Load plugin</Text>
              </TextButton>
            </AlertDialog.ConfirmButton>
          </AlertDialog>
        ),
      })}
    </form.AppForm>
  );
};
