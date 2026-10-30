import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { LazyColumn } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useLocalSearchParams, useRouter } from 'expo-router';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';
import { AuthAdminRevokeSessionInput } from '@repo/auth-api/shared.ts';

import {
  revokeServerUserSession,
  serverUserSessionsAtom,
} from '#src/app/accounts/(selected)/server/users/[id]/index.ts';
import { serverUserSessionAtom } from '#src/app/accounts/(selected)/server/users/[id]/sessions/[sessionId]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionDetails } from '#src/domains/accounts/components/management/session-details';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';

const SessionContent = ({
  userId,
  sessionId,
}: {
  userId: typeof AuthUser.fields.id.Type;
  sessionId: typeof AuthDeviceSession.fields.id.Type;
}) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const state = useAtomValue(serverUserSessionAtom({ account, userId, sessionId }));
  const refresh = useAtomRefresh(serverUserSessionsAtom({ account, userId }));
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
        onSome: (session) => (
          <>
            <SessionDetails session={session} isCurrent={false} />
            {session.isOtherUser ? (
              <SegmentedList modifiers={[padding(0, Spacing.two, 0, 0)]}>
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <SegmentedListItem index={0} count={1} onClick={open} enabled={!busy}>
                      <SegmentedListItem.HeadlineContent>
                        <Text color={colors.error}>Sign out</Text>
                      </SegmentedListItem.HeadlineContent>
                    </SegmentedListItem>
                  )}
                  onSubmit={({ value: input }) => revokeServerUserSession({ account, input })}
                  schema={AuthAdminRevokeSessionInput}
                  defaultValues={{ sessionToken: session.token }}
                  title="Sign out"
                  message="This session will need to sign in again."
                  onSuccess={() => {
                    router.dismissTo({
                      pathname: '/accounts/server/users/[id]',
                      params: { id: userId },
                    });
                  }}
                />
              </SegmentedList>
            ) : (
              <Text
                variant="caption"
                color={colors.onSurfaceVariant}
                modifiers={[padding(0, Spacing.two, 0, 0)]}>
                Use your profile to manage your own signed-in devices.
              </Text>
            )}
          </>
        ),
      }),
  });
};

export default function ServerUserSessionScreen() {
  const { id, sessionId } = useLocalSearchParams<{
    id: typeof AuthUser.fields.id.Type;
    sessionId: typeof AuthDeviceSession.fields.id.Type;
  }>();
  return (
    <AndroidAccountsSheet>
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Text variant="h4" modifiers={[padding(0, 0, 0, Spacing.two)]}>
          Session Details
        </Text>
        <SessionContent key={`${id}-${sessionId}`} userId={id} sessionId={sessionId} />
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}
