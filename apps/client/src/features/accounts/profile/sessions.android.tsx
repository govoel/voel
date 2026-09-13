import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';

import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
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
      <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
        <Text variant="h4">Active sessions / devices</Text>
        <Button onClick={refresh} enabled={!state.waiting} modifiers={[fillMaxWidth()]}>
          <Text>Refresh sessions</Text>
        </Button>
      </Column>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
            <Text variant="h4">Sessions</Text>
            <Text>Loading sessions…</Text>
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
        onSuccess: ({ value: { sessions, currentId } }) =>
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
                <Text variant="h4">
                  {session.id === currentId ? 'This device' : 'Other device'}
                </Text>
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
              </Column>
            ))
          ),
      })}
      <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
        <Text variant="h4">Sign out</Text>
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
      </Column>
    </>
  );
};
