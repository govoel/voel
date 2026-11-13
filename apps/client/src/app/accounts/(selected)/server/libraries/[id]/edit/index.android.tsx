import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { Option, Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Redirect, Stack, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { LibraryForm } from '#src/components/library-editor';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { ListState } from '#src/components/list-state';
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
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const navigation = useNavigation();
  const [savedId, setSavedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  const handleSuccess: Parameters<typeof useLibraryForm>[0]['onSuccess'] = async ({
    id: libraryId,
  }) => {
    const sheet = sheetRef.current;
    if (sheet === null || !navigation.isFocused()) {
      return;
    }
    await sheet.hide();
    if (navigation.isFocused()) {
      setSavedId(Option.some(libraryId));
    }
  };
  if (Option.isSome(savedId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: savedId.value } }}
      />
    );
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      {AsyncResult.matchWithError(state, {
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
          <EditLibraryForm
            source={LibraryEditorSource.Edit({ library: value })}
            onSuccess={handleSuccess}
          />
        ),
      })}
    </AndroidAccountsSheet>
  );
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  return (
    <>
      <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
      {Result.match(params, {
        onFailure: () => (
          <AndroidAccountsSheet>
            <FormLayout footer={null}>
              <ListState kind="message" message="This link is invalid." />
            </FormLayout>
          </AndroidAccountsSheet>
        ),
        onSuccess: ({ id }) => <EditLibrary key={id} id={id} />,
      })}
    </>
  );
}
