import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { AuthAdminRevokeSessionInput } from '@repo/auth-api/shared.ts';
import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionDetails } from '#src/domains/accounts/components/management/session-details';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
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
  const [completed, setCompleted] = useState(false);
  const router = useRouter();
  const state = useAtomValue(serverUserSessionAtom({ account: accountKey, userId, sessionId }));
  const refresh = useAtomRefresh(serverUserSessionsAtom({ account: accountKey, userId }));

  useFocusEffect(
    useCallback(() => {
      if (completed) {
        router.dismissTo({
          pathname: '/accounts/server/users/[id]',
          params: { id: userId },
        });
      }
    }, [completed, router, userId])
  );

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
                  mutation={revokeServerUserSessionAtom(accountKey)}
                  schema={AuthAdminRevokeSessionInput}
                  defaultValues={{ sessionToken: session.token }}
                  title="Sign out"
                  message="This session will need to sign in again."
                  onSuccess={() => {
                    setCompleted(true);
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
  const accountKey = useSelectedAccount();
  const { id, sessionId } = useLocalSearchParams<{
    id: typeof AuthUser.fields.id.Type;
    sessionId: typeof AuthDeviceSession.fields.id.Type;
  }>();
  return (
    <>
      <Stack.Screen.Title>Session Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <SessionContent
            key={JSON.stringify([
              accountKey.serverUrl,
              accountKey.userId,
              accountKey.authStorageId,
              id,
              sessionId,
            ])}
            accountKey={accountKey}
            userId={id}
            sessionId={sessionId}
          />
        </List>
      </Host>
    </>
  );
}
