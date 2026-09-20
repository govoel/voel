import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, LazyColumn, LoadingIndicator, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router, useLocalSearchParams } from 'expo-router';

import { AuthDeviceSession, AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom, revokeOwnSessionAtom } from '#src/app/accounts/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/profile/sessions/[id]/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionDetails } from '#src/components/account-management/session-details';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

const SessionContent = ({ id }: { id: typeof AuthDeviceSession.fields.id.Type }) => {
  const state = useAtomValue(ownSessionAtom(id));
  const refresh = useAtomRefresh(ownSessionsAtom);
  const colors = useMaterialColors();

  return AsyncResult.matchWithError(state, {
    onInitial: () => <LoadingIndicator />,
    onError: (error) => (
      <>
        <Text>{authFailureMessage({ error })}</Text>
        <TextButton onClick={refresh} enabled={!state.waiting}>
          <Text>Retry</Text>
        </TextButton>
      </>
    ),
    onDefect: () => (
      <>
        <Text>Unable to load session.</Text>
        <TextButton onClick={refresh} enabled={!state.waiting}>
          <Text>Retry</Text>
        </TextButton>
      </>
    ),
    onSuccess: ({ value }) =>
      Option.match(value, {
        onNone: () => <Text>This session is no longer active.</Text>,
        onSome: ({ session, isCurrent }) => (
          <>
            <SessionDetails session={session} isCurrent={isCurrent} />
            {!isCurrent ? (
              <MutationConfirmation
                onFailure={authFailureMessage}
                trigger={({ open, busy }) => (
                  <Button
                    onClick={open}
                    enabled={!busy}
                    modifiers={[fillMaxWidth()]}
                    colors={{ containerColor: colors.error, contentColor: colors.onError }}>
                    <Text>Sign Out</Text>
                  </Button>
                )}
                mutation={revokeOwnSessionAtom}
                schema={AuthRevokeSessionInput}
                defaultValues={{ token: session.token }}
                title="Sign Out"
                message="This session will need to sign in again."
                onSuccess={() => {
                  router.back();
                }}
              />
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
    <AndroidAccountsSheet>
      <LazyColumn
        verticalArrangement={{ spacedBy: Spacing.two }}
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Text variant="h4">Session Details</Text>
        {Option.match(sessionId, {
          onNone: () => <Text>Invalid session ID.</Text>,
          onSome: (value) => <SessionContent key={value} id={value} />,
        })}
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}
