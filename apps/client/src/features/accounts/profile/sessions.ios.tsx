import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Section } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';

import { Text } from '#src/components/text';
import {
  ownSessionsAtom,
  revokeOwnSessionAtom,
  signOutEverywhereAtom,
} from '#src/features/accounts/profile/atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';
import { ConfirmAccountAction } from '#src/features/accounts/shared/confirm-account-action';
import { SessionDetails } from '#src/features/accounts/shared/session-details.tsx';

export const OwnSessions = () => {
  const state = useAtomValue(ownSessionsAtom);
  const refresh = useAtomRefresh(ownSessionsAtom);
  return (
    <>
      <Section title="Active sessions / devices">
        <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
          <Text>Refresh sessions</Text>
        </Button>
      </Section>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Section title="Sessions">
            <Text>Loading sessions…</Text>
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
        onSuccess: ({ value: { sessions, currentId } }) =>
          sessions.length === 0 ? (
            <Section title="Sessions">
              <Text>No active sessions.</Text>
            </Section>
          ) : (
            sessions.map((session) => (
              <Section
                key={session.id}
                title={session.id === currentId ? 'This device' : 'Other device'}>
                <SessionDetails session={session} />
                {session.id !== currentId ? (
                  <ConfirmAccountAction
                    mutation={revokeOwnSessionAtom}
                    input={{ token: session.token }}
                    title="Sign out this device"
                    intent="destructive"
                    confirmLabel="Sign out"
                    successMessage="Device signed out."
                    message="This device will need to sign in again."
                  />
                ) : null}
              </Section>
            ))
          ),
      })}
      <Section title="Sign out">
        <ConfirmAccountAction
          mutation={signOutEverywhereAtom}
          input={null}
          title="Sign out everywhere"
          intent="destructive"
          confirmLabel="Sign out everywhere"
          successMessage="Signed out everywhere."
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={() => {
            router.dismissTo('/accounts');
          }}
        />
      </Section>
    </>
  );
};
