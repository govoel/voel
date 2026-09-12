import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { SessionDetails } from '#src/components/account-management/sessions.tsx';
import { Action, Panel } from '#src/components/account-management/ui';
import { serverUserSessionsAtom } from '#src/components/account-management/user-atoms.ts';
import { Text } from '#src/components/text';

export const UserSessions = ({ user }: { user: typeof AuthUser.Type }) => {
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
              </Panel>
            ))
          ),
      })}
    </>
  );
};
