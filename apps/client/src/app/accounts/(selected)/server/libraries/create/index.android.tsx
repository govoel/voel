import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { Option } from 'effect';
import { Redirect } from 'expo-router';
import { useReducer, useRef } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { LibraryForm } from '#src/domains/library/components/library-form';

export default function CreateLibraryScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const [createdId, libraryCreated] = useReducer(
    (_current: Option.Option<typeof Library.fields.id.Type>, id: typeof Library.fields.id.Type) =>
      Option.some(id),
    Option.none()
  );
  if (Option.isSome(createdId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: createdId.value } }}
      />
    );
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <LibraryForm
        target={{ _tag: 'Create' }}
        title="Create Library"
        submitLabel="Create library"
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
