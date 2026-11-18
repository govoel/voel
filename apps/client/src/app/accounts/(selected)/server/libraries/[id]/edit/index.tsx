import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Match, Option, Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { SubmitButton } from '#src/components/form/submit-button';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryEditor } from '#src/domains/library/editor/index.tsx';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { serverLibraryAtom } from '#src/domains/library/management.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const StatusList = ({ children }: { readonly children: ReactNode }) => (
  <List modifiers={[frame({ maxHeight: Infinity })]}>
    <Section>{children}</Section>
  </List>
);

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <StatusList>
        <ListState kind="loading" />
      </StatusList>
    ),
    onError: (error) => (
      <StatusList>
        <ListState
          kind="error"
          message={libraryFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      </StatusList>
    ),
    onDefect: () => (
      <StatusList>
        <ListState
          kind="error"
          message="Unable to load this library."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </StatusList>
    ),
    // Revalidation keeps the editor mounted; it only reads the library when it opens.
    onSuccess: ({ value }) => (
      <LibraryEditor
        key={value.id}
        library={Option.some(value)}
        submitButton={
          <SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save changes</Text>
          </SubmitButton>
        }
        onSaved={() => {
          router.back();
        }}
      />
    ),
  });
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  const router = useRouter();
  return Result.match(params, {
    onFailure: (error) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          SchemaError: () => (
            <>
              <Stack.Screen.Title>Invalid Link</Stack.Screen.Title>
              <Host style={{ flex: 1 }}>
                <StatusList>
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
                </StatusList>
              </Host>
            </>
          ),
        })
      ),
    onSuccess: ({ id }) => (
      <>
        <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
        <Host style={{ flex: 1 }}>
          <EditLibrary key={id} id={id} />
        </Host>
      </>
    ),
  });
}
