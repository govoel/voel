import { Host } from '@expo/ui/swift-ui';
import { Option } from 'effect';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryEditor } from '#src/domains/library/editor';

export default function CreateLibraryScreen() {
  const [createdId, setCreatedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
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
    <>
      <Stack.Screen.Title>Create Library</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <LibraryEditor
          id={Option.none()}
          onSuccess={({ id }) => {
            setCreatedId(Option.some(id));
          }}
        />
      </Host>
    </>
  );
}
