import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';
import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionDetails } from '#src/domains/accounts/components/management/session-details';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { ownSessionsAtom, revokeOwnSessionAtom } from '#src/domains/accounts/features/profile/model.ts';
import { ownSessionAtom } from '#src/domains/accounts/features/profile/sessions/[id]/model.ts';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';



const SessionContent = ({
  accountKey,
  id,
}: {
  accountKey: AccountStorageKey;
  id: typeof AuthDeviceSession.fields.id.Type;
}) => {
  const [completed, setCompleted] = useState(false);
  const router = useRouter();
  const state = useAtomValue(ownSessionAtom({ account: accountKey, id }));
  const refresh = useAtomRefresh(ownSessionsAtom(accountKey));

  useFocusEffect(
    useCallback(() => {
      if (completed) {
        router.dismissTo('/accounts/profile');
      }
    }, [completed, router])
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
        onSome: ({ session, isCurrent }) => (
          <>
            <Section>
              <SessionDetails session={session} isCurrent={isCurrent} />
            </Section>

            {!isCurrent ? (
              <Section>
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                      <Text>Sign out</Text>
                    </Button>
                  )}
                  mutation={revokeOwnSessionAtom(accountKey)}
                  schema={AuthRevokeSessionInput}
                  defaultValues={{ token: session.token }}
                  title="Sign out"
                  message="This session will need to sign in again."
                  onSuccess={() => {
                    setCompleted(true);
                  }}
                />
              </Section>
            ) : null}
          </>
        ),
      }),
  });
};

export default function SessionScreen() {
  const accountKey = useSelectedAccount();
  const { id } = useLocalSearchParams<{ id: typeof AuthDeviceSession.fields.id.Type }>();
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
            ])}
            accountKey={accountKey}
            id={id}
          />
        </List>
      </Host>
    </>
  );
}
