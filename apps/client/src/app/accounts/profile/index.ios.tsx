import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Group, Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  disabled,
  frame,
  headerProminence,
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
  signOutEverywhereAtom,
  useChangePasswordForm,
  useUserProfileForm,
} from '#src/app/accounts/profile/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionList } from '#src/components/account-management/session-list';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { activeAccountAtom } from '#src/services/accounts/atoms.ts';

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
        title="Edit profile"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save changes</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" placeholder="Still You" />}
        </form.AppField>
        <form.AppField name="username">
          {(field) => (
            <field.TextField purpose="username" label="Username" placeholder="stillYou" />
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
        <Section>
          <Button
            onPress={() => {
              setEditor('profile');
            }}>
            <Text>Edit profile</Text>
          </Button>

          <Button
            onPress={() => {
              setEditor('password');
            }}>
            <Text>Change password</Text>
          </Button>
        </Section>

        <OwnSessions />

        <MutationConfirmation
          onFailure={authFailureMessage}
          trigger={({ open, busy }) => (
            <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
              <Text>Sign out everywhere</Text>
            </Button>
          )}
          mutation={signOutEverywhereAtom}
          title="Sign out everywhere"
          confirmLabel="Sign out"
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={() => {
            router.dismissTo('/accounts');
          }}
        />
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
  const refresh = useAtomRefresh(activeAccountAtom);

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
                  <Text>Unable to load your profile.</Text>
                  <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
                    <Text>Retry</Text>
                  </Button>
                </Section>
              </ProfileList>
            ),
            onDefect: () => (
              <ProfileList>
                <Section>
                  <Text>Unable to load your profile.</Text>
                  <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
                    <Text>Retry</Text>
                  </Button>
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
          {(field) => (
            <field.SecureField
              purpose="currentPassword"
              label="Current password"
              placeholder="ha!NiceTry"
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="New password"
              placeholder="notThisTime!"
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="Confirm new password"
              placeholder="notThisTime!"
            />
          )}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const OwnSessions = () => {
  const state = useAtomValue(ownSessionsAtom);
  const refresh = useAtomRefresh(ownSessionsAtom);
  return (
    <Section title="Active Sessions">
      {AsyncResult.matchWithError(state, {
        onInitial: () => <ProgressView />,
        onError: (error) => (
          <>
            <Text>{authFailureMessage({ error })}</Text>
            <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
              <Text>Retry</Text>
            </Button>
          </>
        ),
        onDefect: () => (
          <>
            <Text>Unable to load sessions.</Text>
            <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
              <Text>Retry</Text>
            </Button>
          </>
        ),
        onSuccess: ({ value }) => (
          <SessionList
            sessions={value.sessions}
            currentId={value.currentId}
            onSelect={(session) => {
              router.push({
                pathname: '/accounts/profile/sessions/[id]',
                params: { id: session.id },
              });
            }}
          />
        ),
      })}
    </Section>
  );
};
