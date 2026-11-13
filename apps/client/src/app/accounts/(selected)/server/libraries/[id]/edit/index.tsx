import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack } from 'expo-router';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { LibraryEditor, LibraryEditorScreen } from '#src/components/library-editor';
import { ListState } from '#src/components/list-state';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { serverLibraryAtom } from '#src/domains/library/management.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const account = useSelectedAccount();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return (
    <LibraryEditorScreen>
      {(onSuccess) =>
        AsyncResult.matchWithError(state, {
          onInitial: () => (
            <FormLayout footer={null}>
              <ListState kind="loading" />
            </FormLayout>
          ),
          onError: (error) => (
            <FormLayout footer={null}>
              <ListState
                kind="error"
                message={libraryFailureMessage({ error })}
                onRetry={refresh}
                retrying={state.waiting}
              />
            </FormLayout>
          ),
          onDefect: () => (
            <FormLayout footer={null}>
              <ListState
                kind="error"
                message="Unable to load this library."
                onRetry={refresh}
                retrying={state.waiting}
              />
            </FormLayout>
          ),
          onSuccess: ({ value }) => (
            <LibraryEditor
              source={LibraryEditorSource.Edit({ library: value })}
              onSuccess={onSuccess}
            />
          ),
        })
      }
    </LibraryEditorScreen>
  );
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  return (
    <>
      <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
      {Result.match(params, {
        onFailure: () => (
          <LibraryEditorScreen>
            {() => (
              <FormLayout footer={null}>
                <ListState kind="message" message="This link is invalid." />
              </FormLayout>
            )}
          </LibraryEditorScreen>
        ),
        onSuccess: ({ id }) => <EditLibrary key={id} id={id} />,
      })}
    </>
  );
}
