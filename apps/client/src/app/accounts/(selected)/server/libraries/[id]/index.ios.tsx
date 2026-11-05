import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { autocorrectionDisabled, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers';
import { Array, Match, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useLocalSearchParams } from 'expo-router';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import {
  libraryAtom,
  libraryDetails,
  settingsFormAtom,
  useLibraryNameForm,
  useLibraryRootsForm,
  useLibrarySettingsForm,
} from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Sheet } from '#src/components/sheet';
import { useSheetSelection } from '#src/components/sheet/selection.ts';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { RootFields } from '#src/domains/library/components/root-fields';
import { newRootRow, parseLibraryId } from '#src/domains/library/management.ts';

const NameForm = (props: Parameters<typeof useLibraryNameForm>[0]) => {
  const form = useLibraryNameForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit name"
        footer={
          <form.SubmitButton>
            <Text>Save</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" placeholder="My library" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};
const RootsForm = (props: Parameters<typeof useLibraryRootsForm>[0]) => {
  const form = useLibraryRootsForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit roots"
        footer={
          <form.SubmitButton>
            <Text>Save</Text>
          </form.SubmitButton>
        }>
        <form.Subscribe selector={(state) => state.values.roots}>
          {(rows) => (
            <RootFields
              rows={rows}
              onAdd={() => {
                form.setFieldValue('roots', [...rows, newRootRow()]);
              }}
              onRemove={(index) => {
                form.setFieldValue(
                  'roots',
                  Array.filter(rows, (_, i) => i !== index)
                );
              }}
              renderField={(index) => (
                <form.AppField name={`roots[${index}].root`}>
                  {(root) => (
                    <root.TextField
                      label="Folder path"
                      placeholder="/media/audiobooks"
                      platformProps={{
                        ios: {
                          modifiers: [
                            autocorrectionDisabled(),
                            textInputAutocapitalization('never'),
                          ],
                        },
                      }}
                    />
                  )}
                </form.AppField>
              )}
            />
          )}
        </form.Subscribe>
      </FormLayout>
    </form.AppForm>
  );
};
const SettingsForm = (props: Parameters<typeof useLibrarySettingsForm>[0]) => {
  const form = useLibrarySettingsForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Storage settings"
        footer={
          <form.SubmitButton>
            <Text>Save</Text>
          </form.SubmitButton>
        }>
        {props.fields.length === 0 ? (
          <Text>This storage plugin needs no additional settings.</Text>
        ) : null}
        {Array.map(props.fields, (descriptor) => (
          <form.AppField key={descriptor.name} name={`values.${descriptor.name}`}>
            {(field) => (
              <field.TextField
                label={descriptor.label}
                placeholder={descriptor.placeholder}
                {...(descriptor.purpose !== void 0 ? { purpose: descriptor.purpose } : {})}
              />
            )}
          </form.AppField>
        ))}
      </FormLayout>
    </form.AppForm>
  );
};
const SettingsEditor = (props: Parameters<typeof useLibraryNameForm>[0]) => {
  const account = useSelectedAccount();
  const query = settingsFormAtom({ account, id: props.library.id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return AsyncResult.matchWithError(state, {
    onInitial: () => <ListState kind="loading" />,
    onError: () => (
      <ListState
        kind="error"
        message="Unable to load storage settings."
        onRetry={refresh}
        retrying={state.waiting}
      />
    ),
    onDefect: () => (
      <ListState
        kind="error"
        message="Unable to load storage settings."
        onRetry={refresh}
        retrying={state.waiting}
      />
    ),
    onSuccess: ({ value }) => <SettingsForm {...props} fields={value} />,
  });
};
const Details = ({ library }: { library: Parameters<typeof useLibraryNameForm>[0]['library'] }) => {
  const [selected, dispatch, Event] = useSheetSelection<'name' | 'settings' | 'roots'>();
  const configured = Option.isSome(library.storagePluginSettings);
  return (
    <>
      <List>
        <Section>
          <DetailRows details={libraryDetails({ library })} />
        </Section>
        <Section>
          <Button
            onPress={() => {
              dispatch(Event.Open({ selection: 'name' }));
            }}>
            <Text>Edit name</Text>
          </Button>
          <Button
            onPress={() => {
              dispatch(Event.Open({ selection: 'settings' }));
            }}>
            <Text>Storage settings</Text>
          </Button>
          {configured ? (
            <Button
              onPress={() => {
                dispatch(Event.Open({ selection: 'roots' }));
              }}>
              <Text>Edit roots</Text>
            </Button>
          ) : (
            <Text>Configure storage before editing roots.</Text>
          )}
        </Section>
      </List>
      {Option.match(selected, {
        onNone: () => null,
        onSome: (editor) => (
          <Sheet
            key={editor}
            onDismissed={() => {
              dispatch(Event.Dismissed());
            }}>
            {({ dismiss }) =>
              Match.value(editor).pipe(
                Match.literalsExhaustive({
                  name: () => <NameForm library={library} onSuccess={dismiss} />,
                  settings: () => <SettingsEditor library={library} onSuccess={dismiss} />,
                  roots: () => <RootsForm library={library} onSuccess={dismiss} />,
                })
              )
            }
          </Sheet>
        ),
      })}
    </>
  );
};
const Loaded = ({ id }: { id: typeof Library.fields.id.Type }) => {
  const account = useSelectedAccount();
  const query = libraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return AsyncResult.matchWithError(state, {
    onInitial: () => <ListState kind="loading" />,
    onError: () => (
      <ListState
        kind="error"
        message="Unable to load library."
        onRetry={refresh}
        retrying={state.waiting}
      />
    ),
    onDefect: () => (
      <ListState
        kind="error"
        message="Unable to load library."
        onRetry={refresh}
        retrying={state.waiting}
      />
    ),
    onSuccess: ({ value }) => <Details key={value.id} library={value} />,
  });
};
export default function LibraryScreen() {
  const { id } = useLocalSearchParams();
  const parsed = parseLibraryId(id);
  return (
    <>
      <Stack.Screen.Title>Library Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        {Option.isSome(parsed) ? (
          <Loaded id={parsed.value} />
        ) : (
          <ListState kind="message" message="Invalid library ID." />
        )}
      </Host>
    </>
  );
}
