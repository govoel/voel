import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Match, Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthAdminRevokeSessionInput, AuthUser, AuthUserIdInput } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/app/accounts/auth-failure-message.ts';
import {
  deleteServerUserAtom,
  revokeServerUserSessionAtom,
  revokeServerUserSessionsAtom,
  serverUserAtom,
  serverUserSessionsAtom,
  unbanServerUserAtom,
  useBanUserForm,
  useServerUserProfileForm,
  useUserPasswordForm,
  useUserRoleForm,
  userDetails,
} from '#src/app/accounts/server/users/[id]/index.ts';
import { RoleField } from '#src/components/account-management/role-field';
import { SessionDetails } from '#src/components/account-management/session-details';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';

const UserPasswordForm = (props: Parameters<typeof useUserPasswordForm>[0]) => {
  const form = useUserPasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Set a new password"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Set password</Text>
          </form.SubmitButton>
        }>
        <Text>
          This replaces the user’s password. Share the new password securely. Existing sessions
          remain signed in.
        </Text>
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

const UserProfileForm = (props: Parameters<typeof useServerUserProfileForm>[0]) => {
  const form = useServerUserProfileForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit user profile"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save profile</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" />}
        </form.AppField>
        <form.AppField name="username">
          {(field) => <field.TextField purpose="username" label="Username" />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => <field.TextField purpose="email" label="Email" />}
        </form.AppField>
        <form.AppField name="image">
          {(field) => <field.TextField purpose="url" label="Profile image URL (empty to remove)" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const UserRoleForm = (props: Parameters<typeof useUserRoleForm>[0]) => {
  const form = useUserRoleForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Change role"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save role</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="role">{() => <RoleField />}</form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const BanForm = (props: Parameters<typeof useBanUserForm>[0]) => {
  const form = useBanUserForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Ban user"
        footer={
          <form.SubmitButton
            platformProps={{
              ios: { role: 'destructive', modifiers: [buttonStyle('borderedProminent')] },
            }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Confirm ban</Text>
          </form.SubmitButton>
        }>
        <Text>
          Ban @{props.user.username} indefinitely? This signs out all their devices and prevents
          sign-in until you unban them.
        </Text>
        <form.AppField name="banReason">
          {(field) => <field.TextField label="Ban reason" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const UserSessions = ({ user }: { user: typeof AuthUser.Type }) => {
  const activeKey = useAtomValue(activeAccountKeyAtom);
  const isOtherUser =
    AsyncResult.isSuccess(activeKey) &&
    Option.isSome(activeKey.value) &&
    activeKey.value.value.userId !== user.id;
  const state = useAtomValue(serverUserSessionsAtom(user.id));
  const refresh = useAtomRefresh(serverUserSessionsAtom(user.id));
  return (
    <>
      <Section title="User sessions">
        <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
          <Text>Refresh user sessions</Text>
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
        onSuccess: ({ value: { sessions } }) =>
          sessions.length === 0 ? (
            <Section title="Sessions">
              <Text>No active sessions.</Text>
            </Section>
          ) : (
            sessions.map((session) => (
              <Section key={session.id} title="Device">
                <SessionDetails session={session} />
                {isOtherUser ? (
                  <MutationConfirmation
                    onFailure={authFailureMessage}
                    trigger={({ open, busy }) => (
                      <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                        <Text>Revoke session</Text>
                      </Button>
                    )}
                    mutation={revokeServerUserSessionAtom}
                    schema={AuthAdminRevokeSessionInput}
                    defaultValues={{ sessionToken: session.token }}
                    title="Revoke session"
                    message={`Sign out this device for @${user.username}?`}
                  />
                ) : null}
              </Section>
            ))
          ),
      })}
      {isOtherUser ? (
        <Section title="Revoke all sessions">
          <MutationConfirmation
            onFailure={authFailureMessage}
            trigger={({ open, busy }) => (
              <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                <Text>Sign out all user devices</Text>
              </Button>
            )}
            mutation={revokeServerUserSessionsAtom}
            schema={AuthUserIdInput}
            defaultValues={{ userId: user.id }}
            title="Sign out all user devices"
            message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
          />
        </Section>
      ) : (
        <Section title="Your sessions">
          <Text>Use your profile to sign out your own devices.</Text>
        </Section>
      )}
    </>
  );
};

const LoadedUser = ({
  user,
  waiting,
  refresh,
}: {
  readonly user: typeof AuthAdminUserDetails.Type;
  readonly waiting: boolean;
  readonly refresh: () => void;
}) => {
  const activeKey = useAtomValue(activeAccountKeyAtom);
  const isOtherUser =
    AsyncResult.isSuccess(activeKey) &&
    Option.isSome(activeKey.value) &&
    activeKey.value.value.userId !== user.id;
  const [editor, setEditor] = useState<'role' | 'profile' | 'password' | 'ban' | null>(null);
  return (
    <>
      <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
        <Section title="User details">
          <Button onPress={refresh} modifiers={[disabled(waiting)]}>
            <Text>Refresh user</Text>
          </Button>
        </Section>
        <Section title={user.name}>
          <DetailRows details={userDetails({ user })} />
        </Section>
        {isOtherUser ? (
          <>
            <Section title="Manage user">
              <Button
                onPress={() => {
                  setEditor('role');
                }}>
                <Text>Change role</Text>
              </Button>
              <Button
                onPress={() => {
                  setEditor('profile');
                }}>
                <Text>Edit user profile</Text>
              </Button>
              <Button
                onPress={() => {
                  setEditor('password');
                }}>
                <Text>Set a new password</Text>
              </Button>
            </Section>
            <Section title="Ban status">
              {user.banned === true ? (
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <Button onPress={open} modifiers={[disabled(busy)]}>
                      <Text>Unban user</Text>
                    </Button>
                  )}
                  mutation={unbanServerUserAtom}
                  schema={AuthUserIdInput}
                  defaultValues={{ userId: user.id }}
                  role="default"
                  title="Unban user"
                  message={`Allow @${user.username} to sign in again? Revoked sessions will not be restored.`}
                />
              ) : (
                <Button
                  role="destructive"
                  onPress={() => {
                    setEditor('ban');
                  }}>
                  <Text>Ban user</Text>
                </Button>
              )}
            </Section>
            <Section title="Delete user">
              <MutationConfirmation
                onFailure={authFailureMessage}
                trigger={({ open, busy }) => (
                  <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                    <Text>Delete server user</Text>
                  </Button>
                )}
                mutation={deleteServerUserAtom}
                schema={AuthUserIdInput}
                defaultValues={{ userId: user.id }}
                title="Delete server user"
                message={`Permanently delete @${user.username} (${user.email}) from this server? Their credentials and sessions will be removed. This cannot be undone.`}
                onSuccess={() => {
                  router.replace('/accounts/server/users');
                }}
              />
            </Section>
          </>
        ) : (
          <Section title="Manage user">
            <Text>Use your profile to manage your own account.</Text>
          </Section>
        )}
        <UserSessions user={user} />
      </List>
      <ControlledSheet
        presented={editor !== null}
        onDismiss={() => {
          setEditor(null);
        }}>
        {({ close }) =>
          Match.value(editor).pipe(
            Match.when('role', () => <UserRoleForm user={user} onSuccess={close} />),
            Match.when('profile', () => <UserProfileForm user={user} onSuccess={close} />),
            Match.when('password', () => <UserPasswordForm userId={user.id} onSuccess={close} />),
            Match.when('ban', () => <BanForm user={user} onSuccess={close} />),
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </ControlledSheet>
    </>
  );
};

const UserContent = ({ userId }: { readonly userId: typeof AuthUser.fields.id.Type }) => {
  const state = useAtomValue(serverUserAtom(userId));
  const refresh = useAtomRefresh(serverUserAtom(userId));
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
        <Section title="User">
          <ProgressView />
        </Section>
      </List>
    ),
    onError: (error) => (
      <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
        <Section title="User">
          <Text>{authFailureMessage({ error })}</Text>
          <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
            <Text>Retry</Text>
          </Button>
        </Section>
      </List>
    ),
    onDefect: () => (
      <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
        <Section title="User">
          <Text>Unable to load this user. Try refreshing.</Text>
          <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
            <Text>Retry</Text>
          </Button>
        </Section>
      </List>
    ),
    onSuccess: ({ value, waiting }) => (
      <LoadedUser user={value} waiting={waiting} refresh={refresh} />
    ),
  });
};

export default function ServerUserScreen() {
  const { id } = useLocalSearchParams();
  const userId = Schema.decodeUnknownOption(AuthUser.fields.id.check(Schema.isNonEmpty()))(id);
  return (
    <>
      <Stack.Screen.Title>Manage User</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        {Option.match(userId, {
          onNone: () => (
            <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
              <Section title="User">
                <Text>Invalid user ID.</Text>
              </Section>
            </List>
          ),
          onSome: (value) => <UserContent key={value} userId={value} />,
        })}
      </Host>
    </>
  );
}
