import { useAtomRefresh, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Match, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import { AuthUserIdInput } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails, AuthUser } from '@repo/auth-api/shared.ts';

import {
  deleteServerUserAtom,
  revokeServerUserSessionsAtom,
  serverUserAtom,
  serverUserSessionsAtom,
  useServerUserProfileForm,
  useUserPasswordForm,
  useUserRoleForm,
  userDetails,
} from '#src/app/accounts/server/users/[id]/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { RoleField } from '#src/components/account-management/role-field';
import { SessionList } from '#src/components/account-management/session-list';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Text } from '#src/components/text';
import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import type { AccountStorageKey } from '#src/services/accounts/index.ts';

const UserList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
    {children}
  </List>
);

const UserPasswordForm = (props: Parameters<typeof useUserPasswordForm>[0]) => {
  const form = useUserPasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Set password"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Set password</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="New password"
              placeholder="unguessableThisTime!"
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="Confirm new password"
              placeholder="unguessableThisTime!"
            />
          )}
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
        title="Edit profile"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save changes</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">
          {(field) => <field.TextField purpose="name" label="Name" placeholder="Someone Else" />}
        </form.AppField>
        <form.AppField name="username">
          {(field) => (
            <field.TextField purpose="username" label="Username" placeholder="someoneElse" />
          )}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField purpose="email" label="Email" placeholder="someone@else.com" />
          )}
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

const UserSessions = ({
  accountKey,
  user,
}: {
  accountKey: AccountStorageKey;
  user: typeof AuthUser.Type;
}) => {
  const router = useRouter();
  const state = useAtomValue(serverUserSessionsAtom({ account: accountKey, userId: user.id }));
  const refresh = useAtomRefresh(serverUserSessionsAtom({ account: accountKey, userId: user.id }));
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <Section title="Active Sessions">
        <ListState kind="loading" />
      </Section>
    ),
    onError: (error) => (
      <Section title="Active Sessions">
        <ListState
          kind="error"
          message={authFailureMessage({ error })}
          onRetry={refresh}
          retrying={state.waiting}
        />
      </Section>
    ),
    onDefect: () => (
      <Section title="Active Sessions">
        <ListState
          kind="error"
          message="Unable to load sessions."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </Section>
    ),
    onSuccess: ({ value: { sessions } }) => (
      <>
        <Section title="Active Sessions">
          <SessionList
            sessions={sessions}
            currentId={null}
            onSelect={(session) => {
              router.push({
                pathname: '/accounts/server/users/[id]/sessions/[sessionId]',
                params: { id: user.id, sessionId: session.id },
              });
            }}
          />
        </Section>

        {sessions.length > 0 ? (
          <Section>
            <MutationConfirmation
              onFailure={authFailureMessage}
              trigger={({ open, busy }) => (
                <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                  <Text>Sign out all devices</Text>
                </Button>
              )}
              mutation={revokeServerUserSessionsAtom(accountKey)}
              schema={AuthUserIdInput}
              defaultValues={{ userId: user.id }}
              title="Sign out all devices"
              confirmLabel="Sign out"
              message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
            />
          </Section>
        ) : null}
      </>
    ),
  });
};

const LoadedUser = ({
  accountKey,
  user,
}: {
  accountKey: AccountStorageKey;
  readonly user: typeof AuthAdminUserDetails.Type & { readonly isOtherUser: boolean };
}) => {
  const router = useRouter();
  const details = userDetails({ user });

  const [editor, setEditor] = useState<'role' | 'profile' | 'password' | null>(null);
  return (
    <>
      <UserList>
        <Section>
          <DetailRows details={details} />
        </Section>

        {user.isOtherUser ? (
          <>
            <Section>
              <Button
                onPress={() => {
                  setEditor('profile');
                }}>
                <Text>Edit profile</Text>
              </Button>

              <Button
                onPress={() => {
                  setEditor('role');
                }}>
                <Text>Change role</Text>
              </Button>

              <Button
                onPress={() => {
                  setEditor('password');
                }}>
                <Text>Set password</Text>
              </Button>

              <MutationConfirmation
                onFailure={authFailureMessage}
                trigger={({ open, busy }) => (
                  <Button role="destructive" onPress={open} modifiers={[disabled(busy)]}>
                    <Text>Delete user</Text>
                  </Button>
                )}
                mutation={deleteServerUserAtom(accountKey)}
                schema={AuthUserIdInput}
                defaultValues={{ userId: user.id }}
                title="Delete user"
                confirmLabel="Delete"
                message={`Permanently delete @${user.username} (${user.email}) from this server? Their credentials and sessions will be removed. This cannot be undone.`}
                onSuccess={() => {
                  router.dismissTo('/accounts/server/users');
                }}
              />
            </Section>

            <UserSessions accountKey={accountKey} user={user} />
          </>
        ) : (
          <Section
            footer={
              <Text variant="caption">
                Manage your profile and signed-in devices from your profile.
              </Text>
            }>
            <Button
              onPress={() => {
                router.push('/accounts/profile');
              }}>
              <Text>Go to profile</Text>
            </Button>
          </Section>
        )}
      </UserList>

      <ControlledSheet
        presented={editor !== null}
        onDismiss={() => {
          setEditor(null);
        }}>
        {({ close }) =>
          Match.value(editor).pipe(
            Match.when('role', () => (
              <UserRoleForm accountKey={accountKey} user={user} onSuccess={close} />
            )),
            Match.when('profile', () => (
              <UserProfileForm accountKey={accountKey} user={user} onSuccess={close} />
            )),
            Match.when('password', () => (
              <UserPasswordForm accountKey={accountKey} userId={user.id} onSuccess={close} />
            )),
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </ControlledSheet>
    </>
  );
};

const ServerUserContent = ({
  accountKey,
  id,
}: {
  accountKey: AccountStorageKey;
  id: typeof AuthUser.fields.id.Type;
}) => {
  const state = useAtomValue(serverUserAtom({ account: accountKey, userId: id }));
  const refresh = useAtomRefresh(serverUserAtom({ account: accountKey, userId: id }));
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <UserList>
        <Section>
          <ListState kind="loading" />
        </Section>
      </UserList>
    ),
    onError: (error) => (
      <UserList>
        <Section>
          <ListState
            kind="error"
            message={authFailureMessage({ error })}
            onRetry={refresh}
            retrying={state.waiting}
          />
        </Section>
      </UserList>
    ),
    onDefect: () => (
      <UserList>
        <Section>
          <ListState
            kind="error"
            message="Unable to load this user."
            onRetry={refresh}
            retrying={state.waiting}
          />
        </Section>
      </UserList>
    ),
    onSuccess: ({ value }) => (
      <LoadedUser
        key={JSON.stringify([accountKey, value.id])}
        accountKey={accountKey}
        user={value}
      />
    ),
  });
};

export default function ServerUserScreen() {
  const accountKey = useAtomSuspense(activeAccountKeyAtom).value;
  const { id } = useLocalSearchParams<{ id: (typeof AuthUser)['fields']['id']['Type'] }>();

  return (
    <>
      <Stack.Screen.Title>User Details</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        {Option.match(accountKey, {
          onNone: () => (
            <UserList>
              <Section>
                <ListState kind="empty" message="No active account." />
              </Section>
            </UserList>
          ),
          onSome: (key) => (
            <ServerUserContent key={JSON.stringify([key, id])} accountKey={key} id={id} />
          ),
        })}
      </Host>
    </>
  );
}
