import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { Option, Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { LibraryForm } from '#src/components/library-editor';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { serverLibraryAtom } from '#src/domains/library/management.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibraryForm = (options: Parameters<typeof useLibraryForm>[0]) => {
  const editor = useLibraryForm(options);
  return <LibraryForm source={options.source} editor={editor} />;
};

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const account = useSelectedAccount();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const [savedId, setSavedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  const handleSuccess: Parameters<typeof useLibraryForm>[0]['onSuccess'] = ({ id: libraryId }) => {
    setSavedId(Option.some(libraryId));
  };
  if (Option.isSome(savedId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: savedId.value } }}
      />
    );
  }
  return (
    <Host style={{ flex: 1 }}>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <List modifiers={[frame({ maxHeight: Infinity })]}>
            <Section>
              <ListState kind="loading" />
            </Section>
          </List>
        ),
        onError: (error) => (
          <List modifiers={[frame({ maxHeight: Infinity })]}>
            <Section>
              <ListState
                kind="error"
                message={libraryFailureMessage({ error })}
                onRetry={refresh}
                retrying={state.waiting}
              />
            </Section>
          </List>
        ),
        onDefect: () => (
          <List modifiers={[frame({ maxHeight: Infinity })]}>
            <Section>
              <ListState
                kind="error"
                message="Unable to load this library."
                onRetry={refresh}
                retrying={state.waiting}
              />
            </Section>
          </List>
        ),
        onSuccess: ({ value }) => (
          <EditLibraryForm
            source={LibraryEditorSource.Edit({ library: value })}
            onSuccess={handleSuccess}
          />
        ),
      })}
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
