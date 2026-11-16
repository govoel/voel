import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { Option, Result } from 'effect';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { Text } from '#src/components/text';
import { LibraryEditor } from '#src/domains/library/editor';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const [savedId, setSavedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  if (Option.isSome(savedId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: savedId.value } }}
      />
    );
  }
  return (
    <Host style={{ flex: 1 }}>
      <LibraryEditor
        id={Option.some(id)}
        onSuccess={({ id: libraryId }) => {
          setSavedId(Option.some(libraryId));
        }}
      />
    </Host>
  );
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  const router = useRouter();
  return Result.match(params, {
    onFailure: () => (
      <>
        <Stack.Screen.Title>Invalid Link</Stack.Screen.Title>
        <Host style={{ flex: 1 }}>
          <List modifiers={[frame({ maxHeight: Infinity })]}>
            <Section>
              <Text>This link is invalid.</Text>
              <Button
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/');
                  }
                }}>
                <Text>Back</Text>
              </Button>
            </Section>
          </List>
        </Host>
      </>
    ),
    onSuccess: ({ id }) => (
      <>
        <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
        <EditLibrary key={id} id={id} />
      </>
    ),
  });
}
