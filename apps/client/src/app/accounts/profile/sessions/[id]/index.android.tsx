import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { LazyColumn } from '@expo/ui/jetpack-compose';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';
import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom, revokeOwnSessionAtom } from '#src/app/accounts/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/profile/sessions/[id]/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionDetails } from '#src/components/account-management/session-details';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

const SessionContent = ({ id }: { id: typeof AuthDeviceSession.fields.id.Type }) => {
  const router = useRouter();
  const state = useAtomValue(ownSessionAtom(id));
  const refresh = useAtomRefresh(ownSessionsAtom);
  const colors = useMaterialColors();

  return AsyncResult.matchWithError(state, {
    onInitial: () => <ListState kind="loading" />,
    onError: (error) => (
      <ListState
        kind="error"
        message={authFailureMessage({ error })}
        onRetry={refresh}
        retrying={state.waiting}
      />
    ),
    onDefect: () => (
      <ListState
        kind="error"
        message="Unable to load session."
        onRetry={refresh}
        retrying={state.waiting}
      />
    ),
    onSuccess: ({ value }) =>
      Option.match(value, {
        onNone: () => <ListState kind="message" message="This session is no longer active." />,
        onSome: ({ session, isCurrent }) => (
          <>
            <SessionDetails session={session} isCurrent={isCurrent} />
            {!isCurrent ? (
              <SegmentedList>
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <SegmentedListItem index={0} count={1} onClick={open} enabled={!busy}>
                      <SegmentedListItem.HeadlineContent>
                        <Text color={colors.error}>Sign out</Text>
                      </SegmentedListItem.HeadlineContent>
                    </SegmentedListItem>
                  )}
                  mutation={revokeOwnSessionAtom}
                  schema={AuthRevokeSessionInput}
                  defaultValues={{ token: session.token }}
                  title="Sign out"
                  message="This session will need to sign in again."
                  onSuccess={() => {
                    router.dismissTo('/accounts/profile');
                  }}
                />
              </SegmentedList>
            ) : null}
          </>
        ),
      }),
  });
};

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: typeof AuthDeviceSession.fields.id.Type }>();
  return (
    <AndroidAccountsSheet>
      <LazyColumn
        verticalArrangement={{ spacedBy: Spacing.two }}
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Text variant="h4">Session Details</Text>
        <SessionContent key={id} id={id} />
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}
