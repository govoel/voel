import { Host } from '@expo/ui/swift-ui';
import { Option } from 'effect';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryForm } from '#src/components/library-editor';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';

const source = LibraryEditorSource.Create();

export default function CreateLibraryScreen() {
  const [createdId, setCreatedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  const editor = useLibraryForm({
    source,
    onSuccess: ({ id }) => {
      setCreatedId(Option.some(id));
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
    <>
      <Stack.Screen.Title>Create Library</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <LibraryForm source={source} editor={editor} />
      </Host>
    </>
  );
}
