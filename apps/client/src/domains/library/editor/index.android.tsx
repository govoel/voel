import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import {
  AlertDialog,
  CircularProgressIndicator,
  Icon,
  LazyColumn,
  OutlinedButton,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { Array, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Sheet } from '#src/components/sheet';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
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
      <FormLayout
        title={LibraryEditorSource.$match(options.editor.source, {
          Create: () => 'Create library',
          Edit: () => 'Edit library',
        })}
        footer={
          <form.SubmitButton
            disabled={!StorageState.$is('Ready')(storage)}
            platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>
              {LibraryEditorSource.$match(options.editor.source, {
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
                {Array.map(Library.fields.type.schema.literals, (type) => (
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
                selected={editor.provider === option.value}
                enabled={!editor.submitting && !plugin.loading}
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
        {editor.provider === 'custom' ? (
          <form.AppField name="storagePluginId">
            {(field) => (
              <field.TextField
                label="Plugin ID"
                placeholder="npm:@example/storage-plugin@1.2.3"
                purpose="text"
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>
        ) : null}
        {editor.provider === 'custom' && StorageState.$is('NotLoaded')(storage) ? (
          <OutlinedButton
            modifiers={[fillMaxWidth()]}
            enabled={!editor.submitting && !plugin.loading}
            onClick={() => {
              if (Option.isSome(plugin.consent)) {
                setSheet('consent');
              } else {
                plugin.load();
              }
            }}>
            {plugin.loading ? <CircularProgressIndicator /> : <Text>Load plugin</Text>}
          </OutlinedButton>
        ) : null}
        {Option.match(plugin.error, {
          onNone: () => null,
          onSome: (message) => <Text>{message}</Text>,
        })}
        {StorageState.$is('Unsupported')(storage) ? (
          <Text>
            {`${mediaTypeLabel({ type: Library.fields.type.make(storage.type) })} aren’t supported by this plugin.`}
          </Text>
        ) : null}
        <SegmentedList>
          <SegmentedListItem
            index={0}
            count={1}
            enabled={StorageState.$is('Ready')(storage) && !editor.submitting}
            onClick={() => {
              setSheet('storage');
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
      {sheet === 'consent' && Option.isSome(plugin.consent) ? (
        <AlertDialog
          onDismissRequest={() => {
            setSheet('closed');
          }}>
          <AlertDialog.Title>
            <Text>Load external plugin?</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Text>
              {`${plugin.consent.value}\n\nLoading settings may download and run this plugin on your server with the server process’s permissions. Only continue if you trust its source.\n\nCode may run even if you don’t save the library.`}
            </Text>
          </AlertDialog.Text>
          <AlertDialog.DismissButton>
            <TextButton
              onClick={() => {
                setSheet('closed');
              }}>
              <Text>Cancel</Text>
            </TextButton>
          </AlertDialog.DismissButton>
          <AlertDialog.ConfirmButton>
            <TextButton
              onClick={() => {
                setSheet('closed');
                plugin.load();
              }}>
              <Text>Load plugin</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
        </AlertDialog>
      ) : null}
    </form.AppForm>
  );
};

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
  const status = (content: ReactNode) => (
    <LazyColumn
      contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
      <Text variant="h4" modifiers={[padding(0, 0, 0, Spacing.two)]}>
        {Option.isSome(id) ? 'Edit library' : 'Create library'}
      </Text>
      {content}
    </LazyColumn>
  );
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
