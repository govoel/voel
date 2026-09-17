import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Group, Host, List, ProgressView, Section, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  disabled,
  frame,
  headerProminence,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { Match, Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  activeUserProfileAtom,
  ownSessionsAtom,
  revokeOwnSessionAtom,
  signOutEverywhereAtom,
  useChangePasswordForm,
  useUserProfileForm,
} from '#src/app/accounts/profile/index.ts';
import { SessionDetails } from '#src/components/account-management/session-details';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { authFailureMessage } from '#src/services/accounts/auth.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
    {children}
  </List>
);

const UserProfileEditor = (props: Parameters<typeof useUserProfileForm>[0]) => {
  const form = useUserProfileForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit Profile"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save Changes</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" />}
        </form.AppField>
        <form.AppField name="username">
          {(field) => <field.TextField purpose="username" label="Username" />}
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
      <VStack spacing={0} modifiers={[frame({ maxHeight: Infinity })]}>
        <ProfileList>
          <Section title="Your Profile">
            <DetailRows
              details={[
                { label: 'Name', value: name },
                { label: 'Username', value: `@${username}` },
                { label: 'Email', value: email },
                { label: 'Role', value: role },
              ]}
            />
          </Section>
          <Section title="Password">
            <Button
              onPress={() => {
                setEditor('password');
              }}>
              <Text>Change password</Text>
            </Button>
          </Section>
          <OwnSessions />
        </ProfileList>

        <VStack modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
          <Button
            modifiers={[buttonStyle('borderedProminent')]}
            onPress={() => {
              setEditor('profile');
            }}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>Edit Profile</Text>
          </Button>
        </VStack>
      </VStack>

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
    <>
      <Stack.Screen.Title />
      <Host style={{ flex: 1 }}>
        <Group>
          {AsyncResult.matchWithError(state, {
            onInitial: () => (
              <ProfileList>
                <Section>
                  <ProgressView
                    modifiers={[
                      containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                    ]}
                  />
                </Section>
              </ProfileList>
            ),
            onError: () => (
              <ProfileList>
                <Section>
                  <Text>Unable to load the user profile</Text>
                </Section>
              </ProfileList>
            ),
            onDefect: () => (
              <ProfileList>
                <Section>
                  <Text>Unable to load the user profile</Text>
                </Section>
              </ProfileList>
            ),
            onSuccess: ({ value }) =>
              Option.match(value, {
                onNone: () => (
                  <ProfileList>
                    <Section>
                      <Text>No active user</Text>
                    </Section>
                  </ProfileList>
                ),
                onSome: (profile) => <LoadedProfile key={profile.id} profile={profile} />,
              }),
          })}
        </Group>
      </Host>
    </>
  );
}

const PasswordForm = (props: Parameters<typeof useChangePasswordForm>[0]) => {
  const form = useChangePasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Change password"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save password</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="currentPassword">
          {(field) => <field.SecureField purpose="currentPassword" label="Current password" />}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField purpose="newPassword" label="New password (8–128 characters)" />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => <field.SecureField purpose="newPassword" label="Confirm new password" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const OwnSessions = () => {
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
            <ProgressView />
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
                  <MutationConfirmation
                    onFailure={authFailureMessage}
                    trigger={({ open, busy }) => (
                      <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                        <Text>Sign out this device</Text>
                      </Button>
                    )}
                    mutation={revokeOwnSessionAtom}
                    input={{ token: session.token }}
                    title="Sign out this device"
                    message="This device will need to sign in again."
                  />
                ) : null}
              </Section>
            ))
          ),
      })}
      <Section title="Sign out">
        <MutationConfirmation
          onFailure={authFailureMessage}
          trigger={({ open, busy }) => (
            <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
              <Text>Sign out everywhere</Text>
            </Button>
          )}
          mutation={signOutEverywhereAtom}
          input={null}
          title="Sign out everywhere"
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={() => {
            router.dismissTo('/accounts');
          }}
        />
      </Section>
    </>
  );
};
