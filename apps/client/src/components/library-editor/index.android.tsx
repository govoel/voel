import ArrowDropDown from '@expo/material-symbols/arrow_drop_down.xml';
import Delete from '@expo/material-symbols/delete.xml';
import {
  AlertDialog,
  Button,
  Column,
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  HorizontalDivider,
  Icon,
  IconButton,
  LoadingIndicator,
  OutlinedTextField,
  Row,
  TextButton,
  useNativeState,
} from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, menuAnchor, weight } from '@expo/ui/jetpack-compose/modifiers';
import { Array, Match, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import type { LibraryForm } from '#src/components/library-editor/use-form.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { newSettingsEntry } from '#src/domains/library/editor.ts';
import type { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

const Selection = <T extends string>({
  label,
  selected,
  options,
  onSelect,
  enabled,
}: {
  readonly label: string;
  readonly selected: T;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly onSelect: (value: T) => void;
  readonly enabled: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel = Option.match(
    Array.findFirst(options, (option) => option.value === selected),
    { onNone: () => '', onSome: (option) => option.label }
  );
  const value = useNativeState(selectedLabel);
  useEffect(() => {
    value.set(selectedLabel);
  }, [value, selectedLabel]);
  return (
    <ExposedDropdownMenuBox
      expanded={expanded}
      onExpandedChange={(next) => {
        if (enabled) {
          setExpanded(next);
        }
      }}>
      <OutlinedTextField
        value={value}
        readOnly
        enabled={enabled}
        modifiers={[menuAnchor('primaryNotEditable', enabled), fillMaxWidth()]}>
        <OutlinedTextField.Label>
          <Text>{label}</Text>
        </OutlinedTextField.Label>
        <OutlinedTextField.TrailingIcon>
          <Icon source={ArrowDropDown} />
        </OutlinedTextField.TrailingIcon>
      </OutlinedTextField>
      <ExposedDropdownMenu
        expanded={expanded}
        onDismissRequest={() => {
          setExpanded(false);
        }}>
        {Array.map(options, (option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onSelect(option.value);
              setExpanded(false);
            }}>
            <DropdownMenuItem.Text>
              <Text>{option.label}</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </ExposedDropdownMenu>
    </ExposedDropdownMenuBox>
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
            <form.AppField key={field.name} name={`textValues.${field.name}`}>
              {(input) => (
                <input.TextField
                  label={field.label}
                  placeholder={field.placeholder}
                  purpose={field.purpose}
                  platformProps={{
                    android: { variant: 'outlined', modifiers: [fillMaxWidth()] },
                  }}
                />
              )}
            </form.AppField>
          )),
          Match.when({ kind: 'TextListField' }, (field) => (
            <Column key={field.name} verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text>{field.label}</Text>
              <form.AppField name={`listValues.${field.name}`} mode="array">
                {(list) => (
                  <>
                    {Array.map(list.state.value, (entry, index) => (
                      <Row key={entry.key} verticalAlignment="center">
                        <form.AppField name={`listValues.${field.name}[${index}].value`}>
                          {(input) => (
                            <input.TextField
                              label={field.label}
                              placeholder={field.placeholder}
                              purpose={field.purpose}
                              platformProps={{
                                android: { variant: 'outlined', modifiers: [weight(1)] },
                              }}
                            />
                          )}
                        </form.AppField>
                        <IconButton
                          enabled={!editor.submitting}
                          onClick={() => {
                            list.removeValue(index);
                          }}>
                          <Icon
                            source={Delete}
                            contentDescription={`Remove ${field.label} ${index + 1}`}
                          />
                        </IconButton>
                      </Row>
                    ))}
                    <TextButton
                      enabled={!editor.submitting}
                      onClick={() => {
                        list.pushValue(newSettingsEntry({ value: '' }));
                      }}>
                      <Text>Add entry</Text>
                    </TextButton>
                  </>
                )}
              </form.AppField>
            </Column>
          )),
          Match.exhaustive
        )
      ),
  });
};

export const LibraryEditorScreen = ({ source }: { readonly source: LibraryEditorSource }) => {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const [savedId, setSavedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  const editor = useLibraryForm({
    source,
    onSuccess: async ({ id }) => {
      const sheet = sheetRef.current;
      if (sheet === null) {
        return;
      }
      await sheet.hide();
      setSavedId(Option.some(id));
    },
  });
  const { form } = editor;
  const provider = editor.values.storagePluginId === 'builtin:local' ? 'local' : 'custom';
  if (Option.isSome(savedId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: savedId.value } }}
      />
    );
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <form.AppForm>
        <FormLayout
          title={source._tag === 'Create' ? 'New library' : 'Edit library'}
          footer={
            <form.SubmitButton
              disabled={!editor.ready}
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
              <Text>{source._tag === 'Create' ? 'Create library' : 'Save'}</Text>
            </form.SubmitButton>
          }>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label="Library name"
                placeholder="Library name"
                purpose="name"
                platformProps={{ android: { variant: 'outlined', modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>
          <form.AppField name="type">
            {(field) => (
              <Selection
                label="Media type"
                selected={field.state.value}
                enabled={!editor.submitting}
                onSelect={field.handleChange}
                options={Array.map(['audiobook', 'movie', 'show'] as const, (type) => ({
                  value: type,
                  label: mediaTypeLabel({ type: Library.fields.type.make(type) }),
                }))}
              />
            )}
          </form.AppField>
          <HorizontalDivider />
          <Text variant="h4">Storage</Text>
          <Selection<'local' | 'custom'>
            label="Provider"
            selected={provider}
            enabled={!editor.submitting}
            onSelect={(value) => {
              editor.selectProvider({ provider: value });
            }}
            options={[
              { value: 'local', label: 'Local folders' },
              { value: 'custom', label: 'Custom plugin' },
            ]}
          />
          {provider === 'custom' ? (
            <form.AppField name="storagePluginId">
              {(field) => (
                <field.TextField
                  label="Plugin ID"
                  placeholder="npm:@example/storage-plugin@1.2.3"
                  purpose="text"
                  platformProps={{
                    android: {
                      variant: 'outlined',
                      keyboardOptions: { capitalization: 'none', autoCorrectEnabled: false },
                      modifiers: [fillMaxWidth()],
                    },
                  }}
                />
              )}
            </form.AppField>
          ) : null}
          {provider === 'custom' || !editor.ready ? (
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
          <StorageFields editor={editor} />
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
    </AndroidAccountsSheet>
  );
};
