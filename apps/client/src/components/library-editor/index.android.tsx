import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import {
  AlertDialog,
  Button,
  Icon,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { FormLayout } from '#src/components/form/layout';
import { StorageFields } from '#src/components/library-editor/storage-fields';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
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
  const [storageOpen, setStorageOpen] = useState(false);
  const provider = editor.metadata.storagePluginId === 'builtin:local' ? 'local' : 'custom';
  return (
    <form.AppForm>
      <FormLayout
        title={LibraryEditorSource.$match(source, {
          Create: () => 'Create library',
          Edit: () => 'Edit library',
        })}
        footer={
          <form.SubmitButton
            disabled={!editor.ready}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>
              {LibraryEditorSource.$match(source, {
                Create: () => 'Create library',
                Edit: () => 'Save changes',
              })}
            </Text>
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
        <Text>Storage provider</Text>
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
        <SegmentedList>
          <SegmentedListItem
            index={0}
            count={1}
            enabled={editor.canOpenStorage}
            onClick={() => {
              if (editor.needsConsent) {
                editor.handleRequestConsent();
              } else {
                editor.resetStorage();
                setStorageOpen(true);
              }
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>Storage settings</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              <Icon source={ChevronRight} size={24} />
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
        </SegmentedList>
      </FormLayout>
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
                  enabled={!editor.submitting}
                  onClick={() => {
                    void dismiss();
                  }}
                  modifiers={[fillMaxWidth()]}>
                  <Text>Done</Text>
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
              <TextButton
                onClick={() => {
                  editor.handleApprove();
                  editor.resetStorage();
                  setStorageOpen(true);
                }}>
                <Text>Load plugin</Text>
              </TextButton>
            </AlertDialog.ConfirmButton>
          </AlertDialog>
        ),
      })}
    </form.AppForm>
  );
};
