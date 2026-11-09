import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Array } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { serverLibraryAtom } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { DetailRows } from '#src/components/detail-rows';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryIdInput,
  deleteLibrary,
  libraryDetails,
  libraryFailureMessage,
  libraryStorageDetails,
  libraryStorageErrors,
} from '#src/domains/library/management.ts';

const LibraryList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
    {children}
  </List>
);

const LoadedLibrary = ({
  library,
}: {
  readonly library: Atom.Success<ReturnType<typeof serverLibraryAtom>>;
}) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const errors = libraryStorageErrors({ library });
  return (
    <LibraryList>
      <Section>
        <DetailRows details={libraryDetails({ library })} />
      </Section>
      <Section title="Storage">
        <DetailRows details={libraryStorageDetails({ library })} />
      </Section>
      {errors.length > 0 ? (
        <Section title="Storage errors">
          <Text>{Array.join(errors, '\n\n')}</Text>
        </Section>
      ) : null}
      <Section>
        <Button
          onPress={() => {
            router.push({
              pathname: '/accounts/server/libraries/[id]/edit',
              params: { id: library.id },
            });
          }}>
          <Text>Edit library</Text>
        </Button>
        <MutationConfirmation
          onFailure={libraryFailureMessage}
          trigger={({ open, busy }) => (
            <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
              <Text>Delete library</Text>
            </Button>
          )}
          onSubmit={({ value: input }) => deleteLibrary({ account, input })}
          schema={LibraryIdInput}
          defaultValues={{ id: library.id }}
          title="Delete library"
          confirmLabel="Delete"
          message={`Delete “${library.name}” from this server? This cannot be undone.`}
          onSuccess={() => {
            router.dismissTo('/accounts/server/libraries');
          }}
        />
      </Section>
    </LibraryList>
  );
};

export default function ServerLibraryScreen() {
  const account = useSelectedAccount();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return (
    <>
      <Stack.Screen.Title>Library Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        {AsyncResult.matchWithError(state, {
          onInitial: () => (
            <LibraryList>
              <Section>
                <ListState kind="loading" />
              </Section>
            </LibraryList>
          ),
          onError: (error) => (
            <LibraryList>
              <Section>
                <ListState
                  kind="error"
                  message={libraryFailureMessage({ error })}
                  onRetry={refresh}
                  retrying={state.waiting}
                />
              </Section>
            </LibraryList>
          ),
          onDefect: () => (
            <LibraryList>
              <Section>
                <ListState
                  kind="error"
                  message="Unable to load this library."
                  onRetry={refresh}
                  retrying={state.waiting}
                />
              </Section>
            </LibraryList>
          ),
          onSuccess: ({ value }) => <LoadedLibrary key={value.id} library={value} />,
        })}
      </Host>
    </>
  );
}
