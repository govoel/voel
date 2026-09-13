import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Section } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { Text } from '#src/components/text';
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
      <Section title="User sessions">
        <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
          <Text>Refresh user sessions</Text>
        </Button>
      </Section>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Section title="Sessions">
            <Text>Loading user sessions…</Text>
          </Section>
        ),
        onError: (error) => (
          <Section title="Sessions">
            <Text>{authFailureMessage({ error })}</Text>
          </Section>
        ),
        onDefect: () => (
          <Section title="Sessions">
            <Text>Unable to load sessions. Try refreshing.</Text>
          </Section>
        ),
        onSuccess: ({ value: { sessions } }) =>
          sessions.length === 0 ? (
            <Section title="Sessions">
              <Text>No active sessions.</Text>
            </Section>
          ) : (
            sessions.map((session) => (
              <Section key={session.id} title="Device">
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
              </Section>
            ))
          ),
      })}
      {isOtherUser ? (
        <Section title="Revoke all sessions">
          <ConfirmAccountAction
            mutation={revokeServerUserSessionsAtom}
            input={{ userId: user.id }}
            title="Sign out all user devices"
            intent="destructive"
            confirmLabel="Sign out all devices"
            successMessage="All user devices signed out."
            message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
          />
        </Section>
      ) : (
        <Section title="Your sessions">
          <Text>Use your profile to sign out your own devices.</Text>
        </Section>
      )}
    </>
  );
};
