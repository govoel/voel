import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Group, Host, List, Section } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Match, Option } from 'effect';
import type { Atom } from 'effect/reactivity';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';

import {
  activeUserProfileAtom,
  ownSessionsAtom,
  signOutEverywhere,
  useChangePasswordForm,
  useUserProfileForm,
} from '#src/app/accounts/(selected)/profile/index.ts';
import { DetailRows } from '#src/components/detail-rows';
import { NoFormInput } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Sheet } from '#src/components/sheet';
import { useSheetSelection } from '#src/components/sheet/selection.ts';
import { Text } from '#src/components/text';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionList } from '#src/domains/accounts/components/management/session-list';
import { accountAtom, useSelectedAccount } from '#src/domains/accounts/scope.ts';

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
    Option.Option.Value<Atom.Success<ReturnType<typeof activeUserProfileAtom>>>,
    'email' | 'name' | 'role' | 'username'
  >;
}) => {
  const account = useSelectedAccount();
  const router = useRouter();
  const [editorSelection, dispatchEditor, EditorEvent] = useSheetSelection<
    'profile' | 'password'
  >();

  return (
    <>
      <ProfileList>
        <Section>
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
              dispatchEditor(EditorEvent.Open({ selection: 'profile' }));
            }}>
            <Text>Edit profile</Text>
          </Button>

          <Button
            onPress={() => {
              dispatchEditor(EditorEvent.Open({ selection: 'password' }));
            }}>
            <Text>Change password</Text>
          </Button>
        </Section>

        <OwnSessions />

        <MutationConfirmation
          schema={NoFormInput}
          onFailure={authFailureMessage}
          trigger={({ open, busy }) => (
            <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
              <Text>Sign out everywhere</Text>
            </Button>
          )}
          onSubmit={() => signOutEverywhere({ account })}
          title="Sign out everywhere"
          confirmLabel="Sign out"
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={({ result }) => {
            router.dismissTo(result.accountsRemain ? '/accounts' : '/');
          }}
        />
      </ProfileList>

      {Option.match(editorSelection, {
        onNone: () => null,
        onSome: (editor) => (
          <Sheet
            key={editor}
            onDismissed={() => {
              dispatchEditor(EditorEvent.Dismissed());
            }}>
            {({ dismiss }) =>
              Match.value(editor).pipe(
                Match.literalsExhaustive({
                  profile: () => (
                    <UserProfileEditor profile={{ name, username }} onSuccess={dismiss} />
                  ),
                  password: () => <PasswordForm onSuccess={dismiss} />,
                })
              )
            }
          </Sheet>
        ),
      })}
    </>
  );
};

export default function ProfileScreen() {
  const account = useSelectedAccount();
  const profileQuery = activeUserProfileAtom(account);
  const state = useAtomValue(profileQuery);
  const query = accountAtom(account);
  const refresh = useAtomRefresh(query);

  return (
    <>
      <Stack.Screen.Title>Your Profile</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          {AsyncResult.matchWithError(state, {
            onInitial: () => (
              <ProfileList>
                <Section>
                  <ListState kind="loading" />
                </Section>
              </ProfileList>
            ),
            onError: () => (
              <ProfileList>
                <Section>
                  <ListState
                    kind="error"
                    message="Unable to load your profile."
                    onRetry={refresh}
                    retrying={state.waiting}
                  />
                </Section>
              </ProfileList>
            ),
            onDefect: () => (
              <ProfileList>
                <Section>
                  <ListState
                    kind="error"
                    message="Unable to load your profile."
                    onRetry={refresh}
                    retrying={state.waiting}
                  />
                </Section>
              </ProfileList>
            ),
            onSuccess: ({ value }) =>
              Option.match(value, {
                onNone: () => (
                  <ProfileList>
                    <Section>
                      <ListState kind="empty" message="No active user." />
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
  const account = useSelectedAccount();
  const router = useRouter();
  const query = ownSessionsAtom(account);
  const state = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  return (
    <Section title="Active Sessions">
      {AsyncResult.matchWithError(state, {
        onInitial: () => <ListState kind="loading" />,
        onError: (error) => (
          <ListState
            kind="error"
            message={authFailureMessage({ error })}
            onRetry={refresh}
            retrying={state.waiting}
          />
        ),
        onDefect: () => (
          <ListState
            kind="error"
            message="Unable to load sessions."
            onRetry={refresh}
            retrying={state.waiting}
          />
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
