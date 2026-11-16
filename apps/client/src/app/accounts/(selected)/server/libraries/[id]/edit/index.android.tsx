import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Column, TextButton } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { Match, Option, Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SubmitButton } from '#src/components/form/submit-button';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryEditor } from '#src/domains/library/editor/index.tsx';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { serverLibraryAtom } from '#src/domains/library/management.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const StatusColumn = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <Column
    modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
    verticalArrangement={{ spacedBy: Spacing.two }}>
    <Text variant="h3">{title}</Text>
    {children}
  </Column>
);

const EditLibrary = ({
  id,
  sheetRef,
}: typeof LibraryParams.Type & { readonly sheetRef: RefObject<ModalBottomSheetRef | null> }) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <StatusColumn title="Edit library">
        <ListState kind="loading" />
      </StatusColumn>
    ),
    onError: (error) => (
      <StatusColumn title="Edit library">
        <ListState
          kind="error"
          message={libraryFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      </StatusColumn>
    ),
    onDefect: () => (
      <StatusColumn title="Edit library">
        <ListState
          kind="error"
          message="Unable to load this library."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </StatusColumn>
    ),
    // Revalidation keeps the editor mounted; it only reads the library when it opens.
    onSuccess: ({ value }) => (
      <LibraryEditor
        key={value.id}
        library={Option.some(value)}
        title="Edit library"
        submitButton={
          <SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save changes</Text>
          </SubmitButton>
        }
        onSaved={async () => {
          const sheet = sheetRef.current;
          if (sheet === null) {
            return;
          }
          await sheet.hide();
          router.back();
        }}
      />
    ),
  });
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  const router = useRouter();
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      {Result.match(params, {
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tagsExhaustive({
              SchemaError: () => (
                <StatusColumn title="Invalid link">
                  <Text>This link is invalid.</Text>
                  <TextButton
                    onClick={() => {
                      if (router.canGoBack()) {
                        router.back();
                      } else {
                        router.replace('/');
                      }
                    }}>
                    <Text>Back</Text>
                  </TextButton>
                </StatusColumn>
              ),
            })
          ),
        onSuccess: ({ id }) => <EditLibrary key={id} id={id} sheetRef={sheetRef} />,
      })}
    </AndroidAccountsSheet>
  );
}
