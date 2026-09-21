import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { AuthAdminRevokeSessionInput } from '@repo/auth-api/shared.ts';
import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import {
  revokeServerUserSessionAtom,
  serverUserSessionsAtom,
} from '#src/app/accounts/server/users/[id]/index.ts';
import { serverUserSessionAtom } from '#src/app/accounts/server/users/[id]/sessions/[sessionId]/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionDetails } from '#src/components/account-management/session-details';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';

const SessionContent = ({
  userId,
  sessionId,
}: {
  userId: typeof AuthUser.fields.id.Type;
  sessionId: typeof AuthDeviceSession.fields.id.Type;
}) => {
  const router = useRouter();
  const state = useAtomValue(serverUserSessionAtom({ userId, sessionId }));
  const refresh = useAtomRefresh(serverUserSessionsAtom(userId));

  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <Section>
        <ListState kind="loading" />
      </Section>
    ),
    onError: (error) => (
      <Section>
        <ListState
          kind="error"
          message={authFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      </Section>
    ),
    onDefect: () => (
      <Section>
        <ListState
          kind="error"
          message="Unable to load session."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </Section>
    ),
    onSuccess: ({ value }) =>
      Option.match(value, {
        onNone: () => (
          <Section>
            <ListState kind="message" message="This session is no longer active." />
          </Section>
        ),
        onSome: (session) => (
          <>
            <Section>
              <SessionDetails session={session} isCurrent={false} />
            </Section>

            {session.isOtherUser ? (
              <Section>
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                      <Text>Sign out</Text>
                    </Button>
                  )}
                  mutation={revokeServerUserSessionAtom}
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
              </Section>
            ) : (
              <Section>
                <Text>Use your profile to manage your own signed-in devices.</Text>
              </Section>
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
    <>
      <Stack.Screen.Title>Session Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <SessionContent key={`${id}-${sessionId}`} userId={id} sessionId={sessionId} />
        </List>
      </Host>
    </>
  );
}
