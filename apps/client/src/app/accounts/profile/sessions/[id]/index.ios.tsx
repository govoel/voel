import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import {
  containerRelativeFrame,
  disabled,
  frame,
  headerProminence,
} from '@expo/ui/swift-ui/modifiers';
import { Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { AuthDeviceSession, AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom, revokeOwnSessionAtom } from '#src/app/accounts/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/profile/sessions/[id]/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionDetails } from '#src/components/account-management/session-details';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';

const SessionContent = ({ id }: { id: typeof AuthDeviceSession.fields.id.Type }) => {
  const state = useAtomValue(ownSessionAtom(id));
  const refresh = useAtomRefresh(ownSessionsAtom);

  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <Section>
        <ProgressView
          modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
        />
      </Section>
    ),
    onError: (error) => (
      <Section>
        <Text>{authFailureMessage({ error })}</Text>
        <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
          <Text>Retry</Text>
        </Button>
      </Section>
    ),
    onDefect: () => (
      <Section>
        <Text>Unable to load session.</Text>
        <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
          <Text>Retry</Text>
        </Button>
      </Section>
    ),
    onSuccess: ({ value }) =>
      Option.match(value, {
        onNone: () => (
          <Section>
            <Text>This session is no longer active.</Text>
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
                  mutation={revokeOwnSessionAtom}
                  schema={AuthRevokeSessionInput}
                  defaultValues={{ token: session.token }}
                  title="Sign out"
                  message="This session will need to sign in again."
                  onSuccess={() => {
                    router.dismissTo('/accounts/profile');
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
  const { id } = useLocalSearchParams();
  const sessionId = Schema.decodeUnknownOption(
    AuthDeviceSession.fields.id.check(Schema.isNonEmpty())
  )(id);
  return (
    <>
      <Stack.Screen.Title>Session Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          {Option.match(sessionId, {
            onNone: () => (
              <Section>
                <Text>Invalid session ID.</Text>
              </Section>
            ),
            onSome: (value) => <SessionContent key={value} id={value} />,
          })}
        </List>
      </Host>
    </>
  );
}
