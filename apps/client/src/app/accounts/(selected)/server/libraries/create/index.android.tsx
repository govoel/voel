import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import { Redirect } from 'expo-router';
import { useReducer, useRef } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SubmitButton } from '#src/components/form/submit-button';
import { Text } from '#src/components/text';
import { LibraryEditor } from '#src/domains/library/editor/index.tsx';

export default function CreateLibraryScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
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
    <AndroidAccountsSheet ref={sheetRef}>
      <LibraryEditor
        library={Option.none()}
        title="New library"
        submitButton={
          <SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Create library</Text>
          </SubmitButton>
        }
        onSaved={async ({ id }) => {
          const sheet = sheetRef.current;
          if (sheet === null) {
            return;
          }
          await sheet.hide();
          libraryCreated(id);
        }}
      />
    </AndroidAccountsSheet>
  );
}
