import ArrowDropDown from '@expo/material-symbols/arrow_drop_down.xml';
import Close from '@expo/material-symbols/close.xml';
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
  TopAppBar,
  useNativeState,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxSize,
  fillMaxWidth,
  imePadding,
  menuAnchor,
  padding,
  verticalScroll,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { Array, Match, Option } from 'effect';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useSubmitState } from '#src/components/form/hooks.tsx';
import { useEditorNavigation } from '#src/components/library-editor/navigation.ts';
import { useLibraryEditor } from '#src/components/library-editor/use-editor.ts';
import type { LibraryEditor } from '#src/components/library-editor/use-editor.ts';
import { ScreenHost } from '#src/components/screen-host';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { newSettingsEntry } from '#src/domains/library/editor.ts';
import type { LibraryEditorSource } from '#src/domains/library/editor.ts';
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

const SubmissionFeedback = () => {
  const { errorMessage } = useSubmitState();
  const colors = useMaterialColors();
  return Option.match(errorMessage, {
    onNone: () => null,
    onSome: (message) => <Text color={colors.error}>{message}</Text>,
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
          )
        : null,
  });
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
  const { bottom } = useSafeAreaInsets();
  const external = Option.isSome(editor.pending);
  const provider = editor.values.storagePluginId === 'builtin:local' ? 'local' : 'custom';
  const message = Option.match(editor.pending, {
    onNone: () => 'Discard unsaved changes to this library?',
    onSome: (request) =>
      `${request.storagePluginId}\n\nLoading settings may download and run this plugin on your server with the server process’s permissions. Only continue if you trust its source.\n\nCode may run even if you don’t save the library.`,
  });
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'card' }} />
      <ScreenHost>
        {(top) => (
          <form.AppForm>
            <Column modifiers={[fillMaxSize(), padding(0, top, 0, 0), imePadding()]}>
              <TopAppBar windowInsets={{}}>
                <TopAppBar.NavigationIcon>
                  <IconButton enabled={!editor.submitting} onClick={guard.handleClose}>
                    <Icon source={Close} contentDescription="Close editor" />
                  </IconButton>
                </TopAppBar.NavigationIcon>
                <TopAppBar.Title>
                  <Text>{source._tag === 'Create' ? 'New library' : 'Edit library'}</Text>
                </TopAppBar.Title>
                <TopAppBar.Actions>
                  <TextButton
                    enabled={editor.ready && !editor.submitting}
                    onClick={() => {
                      void form.handleSubmit();
                    }}>
                    <Text>Save</Text>
                  </TextButton>
                </TopAppBar.Actions>
              </TopAppBar>
              <Column
                verticalArrangement={{ spacedBy: Spacing.three }}
                modifiers={[
                  weight(1),
                  verticalScroll(),
                  padding(Spacing.three, Spacing.two, Spacing.three, bottom + Spacing.three),
                ]}>
                <form.AppField name="name">
                  {(field) => (
                    <field.TextField
                      label="Library name"
                      placeholder="Library name"
                      purpose="name"
                      platformProps={{
                        android: { variant: 'outlined', modifiers: [fillMaxWidth()] },
                      }}
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
                {Match.value(editor.status).pipe(
                  Match.when({ _tag: 'Idle' }, () =>
                    !editor.ready && Option.isSome(editor.loaded) ? (
                      <Text>Load settings for the current library details before saving.</Text>
                    ) : null
                  ),
                  Match.when({ _tag: 'Loading' }, () => <LoadingIndicator />),
                  Match.when({ _tag: 'Failed' }, ({ message: failure }) => <Text>{failure}</Text>),
                  Match.exhaustive
                )}
                <StorageFields editor={editor} />
                <SubmissionFeedback />
              </Column>
              {external || guard.discarding ? (
                <AlertDialog
                  onDismissRequest={() => {
                    editor.cancelConsent();
                    guard.cancelDiscard();
                  }}>
                  <AlertDialog.Title>
                    <Text>{external ? 'Load external plugin?' : 'Discard changes?'}</Text>
                  </AlertDialog.Title>
                  <AlertDialog.Text>
                    <Text>{message}</Text>
                  </AlertDialog.Text>
                  <AlertDialog.DismissButton>
                    <TextButton
                      onClick={() => {
                        editor.cancelConsent();
                        guard.cancelDiscard();
                      }}>
                      <Text>Cancel</Text>
                    </TextButton>
                  </AlertDialog.DismissButton>
                  <AlertDialog.ConfirmButton>
                    <TextButton onClick={external ? editor.approve : guard.discard}>
                      <Text>{external ? 'Load plugin' : 'Discard'}</Text>
                    </TextButton>
                  </AlertDialog.ConfirmButton>
                </AlertDialog>
              ) : null}
            </Column>
          </form.AppForm>
        )}
      </ScreenHost>
    </>
  );
};
