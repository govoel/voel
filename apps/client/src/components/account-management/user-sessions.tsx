import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { accountAuthAtom, authFailureMessage } from '#src/components/account-management/atoms.ts';
import { MutationAction } from '#src/components/account-management/mutation-action.tsx';
import { SessionDetails } from '#src/components/account-management/sessions.tsx';
import { Action, Panel } from '#src/components/account-management/ui';
import {
  revokeServerUserSessionAtom,
  revokeServerUserSessionsAtom,
  serverUserSessionsAtom,
} from '#src/components/account-management/user-atoms.ts';
import { Text } from '#src/components/text';

export const UserSessions = ({ user }: { user: typeof AuthUser.Type }) => {
  const auth = useAtomValue(accountAuthAtom);
  const isOtherUser = AsyncResult.isSuccess(auth) && auth.value.key.userId !== user.id;
  const state = useAtomValue(serverUserSessionsAtom(user.id));
  const refresh = useAtomRefresh(serverUserSessionsAtom(user.id));
  return (
    <>
      <Panel title="User sessions">
        <Action title="Refresh user sessions" onPress={refresh} busy={state.waiting} />
      </Panel>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Panel title="Sessions">
            <Text>Loading user sessions…</Text>
          </Panel>
        ),
        onError: (error) => (
          <Panel title="Sessions">
            <Text>{authFailureMessage({ error })}</Text>
          </Panel>
        ),
        onDefect: () => (
          <Panel title="Sessions">
            <Text>Unable to load sessions. Try refreshing.</Text>
          </Panel>
        ),
        onSuccess: ({ value: { sessions } }) =>
          sessions.length === 0 ? (
            <Panel title="Sessions">
              <Text>No active sessions.</Text>
            </Panel>
          ) : (
            sessions.map((session) => (
              <Panel key={session.id} title="Device">
                <SessionDetails session={session} />
                {isOtherUser ? (
                  <MutationAction
                    mutation={revokeServerUserSessionAtom(user.id)}
                    input={{ sessionToken: session.token }}
                    title="Revoke session"
                    message={`Sign out this device for @${user.username}?`}
                  />
                ) : null}
              </Panel>
            ))
          ),
      })}
      {isOtherUser ? (
        <Panel title="Revoke all sessions">
          <MutationAction
            mutation={revokeServerUserSessionsAtom}
            input={{ userId: user.id }}
            title="Sign out all user devices"
            message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
          />
        </Panel>
      ) : (
        <Panel title="Your sessions">
          <Text>Use your profile to sign out your own devices.</Text>
        </Panel>
      )}
    </>
  );
};
