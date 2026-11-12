import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack } from 'expo-router';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { LibraryEditorScreen } from '#src/components/library-editor';
import { ListState } from '#src/components/list-state';
import { SafeScrollView } from '#src/components/safe-scroll-view';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { serverLibraryAtom } from '#src/domains/library/management.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const account = useSelectedAccount();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <SafeScrollView>
        <ListState kind="loading" />
      </SafeScrollView>
    ),
    onError: (error) => (
      <SafeScrollView>
        <ListState
          kind="error"
          message={libraryFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      </SafeScrollView>
    ),
    onDefect: () => (
      <SafeScrollView>
        <ListState
          kind="error"
          message="Unable to load this library."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </SafeScrollView>
    ),
    onSuccess: ({ value }) => (
      <LibraryEditorScreen key={value.id} source={{ _tag: 'Edit', library: value }} />
    ),
  });
};

export const EditLibraryScreen = () => {
  const params = useRouteParams(LibraryParams);
  return (
    <>
      <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
      {Result.match(params, {
        onFailure: () => (
          <SafeScrollView>
            <ListState kind="message" message="This link is invalid." />
          </SafeScrollView>
        ),
        onSuccess: ({ id }) => <EditLibrary key={id} id={id} />,
      })}
    </>
  );
};
