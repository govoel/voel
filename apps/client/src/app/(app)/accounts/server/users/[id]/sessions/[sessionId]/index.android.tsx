import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { LazyColumn } from '@expo/ui/jetpack-compose';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthAdminRevokeSessionInput } from '@repo/auth-api/shared.ts';
import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionDetails } from '#src/domains/accounts/components/management/session-details';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { revokeServerUserSessionAtom, serverUserSessionsAtom } from '#src/domains/accounts/features/server/users/[id]/model.ts';
import { serverUserSessionAtom } from '#src/domains/accounts/features/server/users/[id]/sessions/[sessionId]/model.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';



const SessionContent = ({
  accountKey,
  userId,
  sessionId,
}: {
  accountKey: AccountStorageKey;
  userId: typeof AuthUser.fields.id.Type;
  sessionId: typeof AuthDeviceSession.fields.id.Type;
}) => {
  const router = useRouter();
  const state = useAtomValue(serverUserSessionAtom({ account: accountKey, userId, sessionId }));
  const refresh = useAtomRefresh(serverUserSessionsAtom({ account: accountKey, userId }));
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
                  mutation={revokeServerUserSessionAtom(accountKey)}
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
              <Text variant="caption" color={colors.onSurfaceVariant}>
                Use your profile to manage your own signed-in devices.
              </Text>
            )}
          </>
        ),
      }),
  });
};

export default function ServerUserSessionScreen() {
  const accountKey = useSelectedAccount();
  const { id, sessionId } = useLocalSearchParams<{
    id: typeof AuthUser.fields.id.Type;
    sessionId: typeof AuthDeviceSession.fields.id.Type;
  }>();
  return (
    <AndroidAccountsSheet>
      <LazyColumn
        verticalArrangement={{ spacedBy: Spacing.two }}
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Text variant="h4">Session Details</Text>
        <SessionContent
          key={JSON.stringify([accountKey, id, sessionId])}
          accountKey={accountKey}
          userId={id}
          sessionId={sessionId}
        />
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}
