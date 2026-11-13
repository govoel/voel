import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { Option } from 'effect';
import { Redirect, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { LibraryForm } from '#src/components/library-editor';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';

const source = LibraryEditorSource.Create();

export default function CreateLibraryScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const navigation = useNavigation();
  const [createdId, setCreatedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  const editor = useLibraryForm({
    source,
    onSuccess: async ({ id }) => {
      const sheet = sheetRef.current;
      if (sheet === null || !navigation.isFocused()) {
        return;
      }
      await sheet.hide();
      if (navigation.isFocused()) {
        setCreatedId(Option.some(id));
      }
    },
  });
  if (Option.isSome(createdId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: createdId.value } }}
      />
    );
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <LibraryForm source={source} editor={editor} />
    </AndroidAccountsSheet>
  );
}
