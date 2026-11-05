import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { Array, Match, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useLocalSearchParams } from 'expo-router';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import {
  libraryAtom,
  libraryDetails,
  settingsFormAtom,
  useLibraryNameForm,
  useLibraryRootsForm,
  useLibrarySettingsForm,
} from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Sheet } from '#src/components/sheet';
import { useSheetSelection } from '#src/components/sheet/selection.ts';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
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
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              purpose="name"
              label="Name"
              placeholder="My library"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
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
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
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
                        android: {
                          modifiers: [fillMaxWidth()],
                          keyboardOptions: { capitalization: 'none', autoCorrectEnabled: false },
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
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
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
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
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
  const colors = useMaterialColors();
  const configured = Option.isSome(library.storagePluginSettings);
  return (
    <>
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Text variant="h4" modifiers={[padding(0, 0, 0, Spacing.two)]}>
          Library Details
        </Text>
        <DetailRows details={libraryDetails({ library })} />
        <SegmentedList modifiers={[padding(0, Spacing.two, 0, 0)]}>
          <SegmentedListItem
            index={0}
            count={3}
            onClick={() => {
              dispatch(Event.Open({ selection: 'name' }));
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>Edit name</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
          <SegmentedListItem
            index={1}
            count={3}
            onClick={() => {
              dispatch(Event.Open({ selection: 'settings' }));
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>Storage settings</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
          <SegmentedListItem
            index={2}
            count={3}
            enabled={configured}
            onClick={() => {
              dispatch(Event.Open({ selection: 'roots' }));
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>{configured ? 'Edit roots' : 'Configure storage before editing roots'}</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
        </SegmentedList>
      </LazyColumn>
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
    <AndroidAccountsSheet>
      {Option.isSome(parsed) ? (
        <Loaded id={parsed.value} />
      ) : (
        <ListState kind="message" message="Invalid library ID." />
      )}
    </AndroidAccountsSheet>
  );
}
