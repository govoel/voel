import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Group, Host, List, Section } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Match, Option } from 'effect';
import type { Atom } from 'effect/reactivity';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { accountAtom } from '#src/domains/accounts/atoms.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { SessionList } from '#src/domains/accounts/components/management/session-list';
import {
  ownSessionsAtom,
  signOutEverywhereAtom,
  useChangePasswordForm,
  useUserProfileForm,
  userProfileAtom,
} from '#src/domains/accounts/features/profile/model.ts';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';

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

// Completion belongs to this editor instance, not a later reopened editor.
const ProfileEditor = ({
  accountKey,
  profile,
  editor,
  close,
}: {
  accountKey: AccountStorageKey;
  profile: Parameters<typeof useUserProfileForm>[0]['profile'];
  editor: 'profile' | 'password';
  close: () => void;
}) => {
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (completed) {
      close();
    }
  }, [completed, close]);
  const onSuccess = () => {
    setCompleted(true);
  };
  return Match.value(editor).pipe(
    Match.when('profile', () => (
      <UserProfileEditor accountKey={accountKey} profile={profile} onSuccess={onSuccess} />
    )),
    Match.when('password', () => <PasswordForm accountKey={accountKey} onSuccess={onSuccess} />),
    Match.exhaustive
  );
};

const LoadedProfile = ({
  accountKey,
  profile,
  onSignedOut,
}: {
  accountKey: AccountStorageKey;
  onSignedOut: () => void;
  profile: Option.Option.Value<Atom.Success<ReturnType<typeof userProfileAtom>>>;
}) => {
  const [editor, setEditor] = useState<Parameters<typeof ProfileEditor>[0]['editor'] | null>(null);
  const { email, name, role, username } = profile;

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

        <OwnSessions accountKey={accountKey} />

        <MutationConfirmation
          onFailure={authFailureMessage}
          trigger={({ open, busy }) => (
            <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
              <Text>Sign out everywhere</Text>
            </Button>
          )}
          mutation={signOutEverywhereAtom(accountKey)}
          title="Sign out everywhere"
          confirmLabel="Sign out"
          message="Sign out all devices for this account on this server, including this device?"
          onSuccess={onSignedOut}
        />
      </ProfileList>
      <ControlledSheet
        presented={editor !== null}
        onDismissRequest={() => {
          setEditor(null);
        }}>
        {({ close }) =>
          editor === null ? null : (
            <ProfileEditor
              key={editor}
              accountKey={accountKey}
              profile={profile}
              editor={editor}
              close={close}
            />
          )
        }
      </ControlledSheet>
    </>
  );
};

const ProfileContent = ({ accountKey }: { accountKey: AccountStorageKey }) => {
  const [completed, setCompleted] = useState(false);
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      if (completed) {
        router.dismissTo('/accounts');
      }
    }, [completed, router])
  );
  const state = useAtomValue(userProfileAtom(accountKey));
  const refresh = useAtomRefresh(accountAtom(accountKey));
  return AsyncResult.matchWithError(state, {
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
        onSome: (profile) => (
          <LoadedProfile
            key={profile.id}
            accountKey={accountKey}
            profile={profile}
            onSignedOut={() => {
              setCompleted(true);
            }}
          />
        ),
      }),
  });
};

export default function ProfileScreen() {
  const accountKey = useSelectedAccount();

  return (
    <>
      <Stack.Screen.Title>Your Profile</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          <ProfileContent
            key={JSON.stringify([
              accountKey.serverUrl,
              accountKey.userId,
              accountKey.authStorageId,
            ])}
            accountKey={accountKey}
          />
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

const OwnSessions = ({ accountKey }: { accountKey: AccountStorageKey }) => {
  const router = useRouter();
  const sessionsAtom = ownSessionsAtom(accountKey);
  const state = useAtomValue(sessionsAtom);
  const refresh = useAtomRefresh(sessionsAtom);
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
