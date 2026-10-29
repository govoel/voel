import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';
import { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom, revokeOwnSession } from '#src/app/accounts/(selected)/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/(selected)/profile/sessions/[id]/index.ts';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionDetails } from '#src/domains/accounts/components/management/session-details';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';

const SessionContent = ({ id }: { id: typeof AuthDeviceSession.fields.id.Type }) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const state = useAtomValue(ownSessionAtom({ account, id }));
  const query = ownSessionsAtom(account);
  const refresh = useAtomRefresh(query);

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
                  onSubmit={({ value: input }) => revokeOwnSession({ account, input })}
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
  const { id } = useLocalSearchParams<{ id: typeof AuthDeviceSession.fields.id.Type }>();
  return (
    <>
      <Stack.Screen.Title>Session Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <SessionContent key={id} id={id} />
        </List>
      </Host>
    </>
  );
}
