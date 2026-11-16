import { Host } from '@expo/ui/swift-ui';
import { Option } from 'effect';
import { Redirect, Stack } from 'expo-router';
import { useReducer } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryForm } from '#src/domains/library/components/library-form';

export default function CreateLibraryScreen() {
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
    <>
      <Stack.Screen.Title>Create Library</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <LibraryForm
          target={{ _tag: 'Create' }}
          submitLabel="Create library"
          onSaved={({ id }) => {
            libraryCreated(id);
          }}
        />
      </Host>
    </>
  );
}
