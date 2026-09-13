import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import {
  revokeServerUserSessionAtom,
  revokeServerUserSessionsAtom,
  serverUserSessionsAtom,
} from '#src/features/accounts/server-users/user-atoms.ts';
import { accountAuthAtom } from '#src/features/accounts/shared/atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';
import { ConfirmAccountAction } from '#src/features/accounts/shared/confirm-account-action';
import { SessionDetails } from '#src/features/accounts/shared/session-details.tsx';

export const UserSessions = ({ user }: { user: typeof AuthUser.Type }) => {
  const auth = useAtomValue(accountAuthAtom);
  const isOtherUser = AsyncResult.isSuccess(auth) && auth.value.key.userId !== user.id;
  const state = useAtomValue(serverUserSessionsAtom(user.id));
  const refresh = useAtomRefresh(serverUserSessionsAtom(user.id));
  return (
    <>
      <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
        <Text variant="h4">User sessions</Text>
        <Button onClick={refresh} enabled={!state.waiting} modifiers={[fillMaxWidth()]}>
          <Text>Refresh user sessions</Text>
        </Button>
      </Column>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
            <Text variant="h4">Sessions</Text>
            <Text>Loading user sessions…</Text>
          </Column>
        ),
        onError: (error) => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
            <Text variant="h4">Sessions</Text>
            <Text>{authFailureMessage({ error })}</Text>
          </Column>
        ),
        onDefect: () => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
            <Text variant="h4">Sessions</Text>
            <Text>Unable to load sessions. Try refreshing.</Text>
          </Column>
        ),
        onSuccess: ({ value: { sessions } }) =>
          sessions.length === 0 ? (
            <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
              <Text variant="h4">Sessions</Text>
              <Text>No active sessions.</Text>
            </Column>
          ) : (
            sessions.map((session) => (
              <Column
                key={session.id}
                verticalArrangement={{ spacedBy: Spacing.two }}
                modifiers={[fillMaxWidth()]}>
                <Text variant="h4">Device</Text>
                <SessionDetails session={session} />
                {isOtherUser ? (
                  <ConfirmAccountAction
                    mutation={revokeServerUserSessionAtom(user.id)}
                    input={{ sessionToken: session.token }}
                    title="Revoke session"
                    intent="destructive"
                    confirmLabel="Revoke session"
                    successMessage="Session revoked."
                    message={`Sign out this device for @${user.username}?`}
                  />
                ) : null}
              </Column>
            ))
          ),
      })}
      {isOtherUser ? (
        <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
          <Text variant="h4">Revoke all sessions</Text>
          <ConfirmAccountAction
            mutation={revokeServerUserSessionsAtom}
            input={{ userId: user.id }}
            title="Sign out all user devices"
            intent="destructive"
            confirmLabel="Sign out all devices"
            successMessage="All user devices signed out."
            message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
          />
        </Column>
      ) : (
        <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
          <Text variant="h4">Your sessions</Text>
          <Text>Use your profile to sign out your own devices.</Text>
        </Column>
      )}
    </>
  );
};
