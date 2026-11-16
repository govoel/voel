import { Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { Redirect, Stack } from 'expo-router';
import { useReducer } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { SubmitButton } from '#src/components/form/submit-button';
import { Text } from '#src/components/text';
import { LibraryEditor } from '#src/domains/library/editor/index.tsx';

export default function CreateLibraryScreen() {
  const [createdLibraryId, libraryCreated] = useReducer(
    (
      _current: Option.Option<typeof Library.fields.id.Type>,
      libraryId: typeof Library.fields.id.Type
    ) => Option.some(libraryId),
    Option.none()
  );
  if (Option.isSome(createdLibraryId)) {
    return (
      <Redirect
        href={{
          pathname: '/accounts/server/libraries/[id]',
          params: { id: createdLibraryId.value },
        }}
      />
    );
  }
  return (
    <>
      <Stack.Screen.Title>New Library</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <LibraryEditor
          library={Option.none()}
          submitButton={
            <SubmitButton
              platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
              containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
              <Text>Create library</Text>
            </SubmitButton>
          }
          onSaved={({ id }) => {
            libraryCreated(id);
          }}
        />
      </Host>
    </>
  );
}
