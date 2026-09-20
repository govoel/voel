import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Column, LazyColumn, LoadingIndicator, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match, Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';

import {
  activeUserProfileAtom,
  ownSessionsAtom,
  revokeOwnSessionAtom,
  signOutEverywhereAtom,
  useChangePasswordForm,
  useUserProfileForm,
} from '#src/app/accounts/profile/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionDetails } from '#src/components/account-management/session-details';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <LazyColumn
    verticalArrangement={{ spacedBy: Spacing.two }}
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
    {children}
  </LazyColumn>
);

const UserProfileEditor = (props: Parameters<typeof useUserProfileForm>[0]) => {
  const form = useUserProfileForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit Profile"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save Changes</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              purpose="name"
              label="Name"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                },
              }}
            />
          )}
        </form.AppField>
        <form.AppField name="username">
          {(field) => (
            <field.TextField
              purpose="username"
              label="Username"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                },
              }}
            />
          )}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const LoadedProfile = ({
  profile: { email, name, role, username },
}: {
  profile: Pick<
    Option.Option.Value<Atom.Success<typeof activeUserProfileAtom>>,
    'email' | 'name' | 'role' | 'username'
  >;
}) => {
  const [editor, setEditor] = useState<'profile' | 'password' | null>(null);

  return (
    <>
      <ProfileList>
        <Text variant="h4">Your Profile</Text>
        <DetailRows
          details={[
            { label: 'Name', value: name },
            { label: 'Username', value: `@${username}` },
            { label: 'Email', value: email },
            { label: 'Role', value: role },
          ]}
        />
        <Button
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            setEditor('profile');
          }}>
          <Text>Edit Profile</Text>
        </Button>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">Password</Text>
          <Button
            onClick={() => {
              setEditor('password');
            }}>
            <Text>Change password</Text>
          </Button>
        </Column>
        <OwnSessions />
      </ProfileList>

      <ControlledSheet
        presented={editor !== null}
        onDismiss={() => {
          setEditor(null);
        }}>
        {({ close }) =>
          Match.value(editor).pipe(
            Match.when('profile', () => (
              <UserProfileEditor profile={{ name, username }} onSuccess={close} />
            )),
            Match.when('password', () => <PasswordForm onSuccess={close} />),
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </ControlledSheet>
    </>
  );
};

export default function ProfileScreen() {
  const state = useAtomValue(activeUserProfileAtom);

  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <ProfileList>
            <LoadingIndicator modifiers={[fillMaxWidth()]} />
          </ProfileList>
        ),
        onError: () => (
          <ProfileList>
            <Text>Unable to load the user profile</Text>
          </ProfileList>
        ),
        onDefect: () => (
          <ProfileList>
            <Text>Unable to load the user profile</Text>
          </ProfileList>
        ),
        onSuccess: ({ value }) =>
          Option.match(value, {
            onNone: () => (
              <ProfileList>
                <Text>No active user</Text>
              </ProfileList>
            ),
            onSome: (profile) => <LoadedProfile key={profile.id} profile={profile} />,
          }),
      })}
    </AndroidAccountsSheet>
  );
}

const PasswordForm = (props: Parameters<typeof useChangePasswordForm>[0]) => {
  const form = useChangePasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Change password"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save password</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="currentPassword">
          {(field) => (
            <field.SecureField
              purpose="currentPassword"
              label="Current password"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="New password (8–128 characters)"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="Confirm new password"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const OwnSessions = () => {
  const colors = useMaterialColors();
  const state = useAtomValue(ownSessionsAtom);
  const refresh = useAtomRefresh(ownSessionsAtom);
  return (
    <>
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h4">Active sessions / devices</Text>
        <Button onClick={refresh} enabled={!state.waiting}>
          <Text>Refresh sessions</Text>
        </Button>
      </Column>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }}>
            <Text variant="h4">Sessions</Text>
            <LoadingIndicator />
          </Column>
        ),
        onError: (error) => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }}>
            <Text variant="h4">Sessions</Text>
            <Text>{authFailureMessage({ error })}</Text>
          </Column>
        ),
        onDefect: () => (
          <Column verticalArrangement={{ spacedBy: Spacing.two }}>
            <Text variant="h4">Sessions</Text>
            <Text>Unable to load sessions. Try refreshing.</Text>
          </Column>
        ),
        onSuccess: ({ value: { sessions, currentId } }) =>
          sessions.length === 0 ? (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">Sessions</Text>
              <Text>No active sessions.</Text>
            </Column>
          ) : (
            sessions.map((session) => (
              <Column key={session.id} verticalArrangement={{ spacedBy: Spacing.two }}>
                <Text variant="h4">
                  {session.id === currentId ? 'This device' : 'Other device'}
                </Text>
                <SessionDetails session={session} />
                {session.id !== currentId ? (
                  <MutationConfirmation
                    onFailure={authFailureMessage}
                    trigger={({ open, busy }) => (
                      <TextButton onClick={open} enabled={!busy}>
                        <Text color={colors.error}>Sign out this device</Text>
                      </TextButton>
                    )}
                    mutation={revokeOwnSessionAtom}
                    schema={AuthRevokeSessionInput}
                    defaultValues={{ token: session.token }}
                    title="Sign out this device"
                    message="This device will need to sign in again."
                  />
                ) : null}
              </Column>
            ))
          ),
      })}
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h4">Sign out</Text>
        <MutationConfirmation
          onFailure={authFailureMessage}
          trigger={({ open, busy }) => (
            <TextButton onClick={open} enabled={!busy}>
              <Text color={colors.error}>Sign out everywhere</Text>
            </TextButton>
          )}
          mutation={signOutEverywhereAtom}
          title="Sign out everywhere"
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={() => {
            router.dismissTo('/accounts');
          }}
        />
      </Column>
    </>
  );
};
