import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { DateTime } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import {
  authFailureMessage,
  ownSessionsAtom,
  revokeOwnSessionAtom,
  signOutEverywhereAtom,
} from '#src/components/account-management/atoms.ts';
import { MutationAction } from '#src/components/account-management/mutation-action.tsx';
import { Action, Panel } from '#src/components/account-management/ui';
import { Text } from '#src/components/text';

export const SessionDetails = ({ session }: { session: typeof AuthDeviceSession.Type }) => (
  <>
    <Text>{session.userAgent ?? 'Unknown device'}</Text>
    <Text>IP address: {session.ipAddress ?? 'Unknown'}</Text>
    <Text>Signed in: {DateTime.formatIso(session.createdAt)}</Text>
    <Text>Last updated: {DateTime.formatIso(session.updatedAt)}</Text>
    <Text>Expires: {DateTime.formatIso(session.expiresAt)}</Text>
  </>
);

export const OwnSessions = () => {
  const state = useAtomValue(ownSessionsAtom);
  const refresh = useAtomRefresh(ownSessionsAtom);
  return (
    <>
      <Panel title="Active sessions / devices">
        <Action title="Refresh sessions" onPress={refresh} busy={state.waiting} />
      </Panel>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Panel title="Sessions">
            <Text>Loading sessions…</Text>
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
        onSuccess: ({ value: { sessions, currentId } }) =>
          sessions.length === 0 ? (
            <Panel title="Sessions">
              <Text>No active sessions.</Text>
            </Panel>
          ) : (
            sessions.map((session) => (
              <Panel
                key={session.id}
                title={session.id === currentId ? 'This device' : 'Other device'}>
                <SessionDetails session={session} />
                {session.id !== currentId ? (
                  <MutationAction
                    mutation={revokeOwnSessionAtom}
                    input={{ token: session.token }}
                    title="Sign out this device"
                    message="This device will need to sign in again."
                  />
                ) : null}
              </Panel>
            ))
          ),
      })}
      <Panel title="Sign out">
        <MutationAction
          mutation={signOutEverywhereAtom}
          input={null}
          title="Sign out everywhere"
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={() => {
            router.dismissTo('/accounts');
          }}
        />
      </Panel>
    </>
  );
};
