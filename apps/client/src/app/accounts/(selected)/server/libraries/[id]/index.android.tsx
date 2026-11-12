import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { Array, Match, Result } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { DetailRows } from '#src/components/detail-rows';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  deleteLibrary,
  libraryDetails,
  libraryFailureMessage,
  libraryStorageDetails,
  libraryStorageErrors,
  serverLibraryAtom,
} from '#src/domains/library/management.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const LibraryList = ({ children }: PropsWithChildren) => (
  <LazyColumn contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
    <Text variant="h4" modifiers={[padding(0, 0, 0, Spacing.two)]}>
      Library Details
    </Text>
    {children}
  </LazyColumn>
);

const LoadedLibrary = ({
  library,
}: {
  readonly library: Atom.Success<ReturnType<typeof serverLibraryAtom>>;
}) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const colors = useMaterialColors();
  const errors = libraryStorageErrors({ library });
  return (
    <LibraryList>
      <DetailRows details={libraryDetails({ library })} />
      <Text variant="h4" modifiers={[padding(0, Spacing.two, 0, Spacing.two)]}>
        Storage
      </Text>
      <DetailRows details={libraryStorageDetails({ library })} />
      {errors.length > 0 ? (
        <>
          <Text variant="h4" modifiers={[padding(0, Spacing.two, 0, Spacing.two)]}>
            Storage errors
          </Text>
          <ListState kind="message" message={Array.join(errors, '\n\n')} />
        </>
      ) : null}
      <SegmentedList modifiers={[padding(0, Spacing.two, 0, 0)]}>
        <SegmentedListItem
          index={0}
          count={2}
          onClick={() => {
            router.push({
              pathname: '/accounts/server/libraries/[id]/edit',
              params: { id: library.id },
            });
          }}>
          <SegmentedListItem.HeadlineContent>
            <Text>Edit library</Text>
          </SegmentedListItem.HeadlineContent>
          <SegmentedListItem.TrailingContent>
            <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
          </SegmentedListItem.TrailingContent>
        </SegmentedListItem>
        <MutationConfirmation
          onFailure={libraryFailureMessage}
          trigger={({ open, busy }) => (
            <SegmentedListItem index={1} count={2} onClick={open} enabled={!busy}>
              <SegmentedListItem.HeadlineContent>
                <Text color={colors.error}>Delete library</Text>
              </SegmentedListItem.HeadlineContent>
            </SegmentedListItem>
          )}
          onSubmit={() => deleteLibrary({ account, id: library.id })}
          title="Delete library"
          confirmLabel="Delete"
          message={`Delete “${library.name}” from this server? This cannot be undone.`}
          onSuccess={() => {
            router.dismissTo('/accounts/server/libraries');
          }}
        />
      </SegmentedList>
    </LibraryList>
  );
};

const LibraryDetails = ({ id }: typeof LibraryParams.Type) => {
  const account = useSelectedAccount();
  const query = serverLibraryAtom({ account, id });
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <LibraryList>
            <ListState kind="loading" />
          </LibraryList>
        ),
        onError: (error) => (
          <LibraryList>
            <ListState
              kind="error"
              message={libraryFailureMessage({ error })}
              onRetry={refresh}
              retrying={state.waiting}
            />
          </LibraryList>
        ),
        onDefect: () => (
          <LibraryList>
            <ListState
              kind="error"
              message="Unable to load this library."
              onRetry={refresh}
              retrying={state.waiting}
            />
          </LibraryList>
        ),
        onSuccess: ({ value }) => <LoadedLibrary key={value.id} library={value} />,
      })}
    </AndroidAccountsSheet>
  );
};

export default function ServerLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  const router = useRouter();
  return Result.match(params, {
    onFailure: (error) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          SchemaError: () => (
            <AndroidAccountsSheet>
              <LazyColumn
                contentPadding={{
                  start: Spacing.three,
                  end: Spacing.three,
                  bottom: Spacing.three,
                }}>
                <Text variant="h4" modifiers={[padding(0, 0, 0, Spacing.two)]}>
                  Invalid Link
                </Text>
                <SegmentedList>
                  <SegmentedListItem index={0} count={2} enabled={false}>
                    <SegmentedListItem.HeadlineContent>
                      <Text>This link is invalid.</Text>
                    </SegmentedListItem.HeadlineContent>
                  </SegmentedListItem>
                  <SegmentedListItem
                    index={1}
                    count={2}
                    onClick={() => {
                      if (router.canGoBack()) {
                        router.back();
                      } else {
                        router.replace('/');
                      }
                    }}>
                    <SegmentedListItem.HeadlineContent>
                      <Text>Back</Text>
                    </SegmentedListItem.HeadlineContent>
                  </SegmentedListItem>
                </SegmentedList>
              </LazyColumn>
            </AndroidAccountsSheet>
          ),
        })
      ),
    onSuccess: ({ id }) => <LibraryDetails key={id} id={id} />,
  });
}
