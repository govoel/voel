import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import {
  Button,
  Column,
  LazyColumn,
  LoadingIndicator,
  TextButton,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match, Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthUser } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

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
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { materialSeedColor } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { accountAuthAtom, authFailureMessage } from '#src/services/accounts/auth.ts';

const UserPasswordForm = (props: Parameters<typeof useUserPasswordForm>[0]) => {
  const form = useUserPasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Set a new password"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Set password</Text>
          </form.SubmitButton>
        }>
        <Text>
          This replaces the user’s password. Share the new password securely. Existing sessions
          remain signed in.
        </Text>
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

const UserProfileForm = (props: Parameters<typeof useServerUserProfileForm>[0]) => {
  const form = useServerUserProfileForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit user profile"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save profile</Text>
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
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              purpose="email"
              label="Email"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                },
              }}
            />
          )}
        </form.AppField>
        <form.AppField name="image">
          {(field) => (
            <field.TextField
              purpose="url"
              label="Profile image URL (empty to remove)"
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

const UserRoleForm = (props: Parameters<typeof useUserRoleForm>[0]) => {
  const form = useUserRoleForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Change role"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
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
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Confirm ban</Text>
          </form.SubmitButton>
        }>
        <Text>
          Ban @{props.user.username} indefinitely? This signs out all their devices and prevents
          sign-in until you unban them.
        </Text>
        <form.AppField name="banReason">
          {(field) => (
            <field.TextField
              label="Ban reason"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

const UserSessions = ({ user }: { user: typeof AuthUser.Type }) => {
  const colors = useMaterialColors({ seedColor: materialSeedColor });
  const auth = useAtomValue(accountAuthAtom);
  const isOtherUser = AsyncResult.isSuccess(auth) && auth.value.key.userId !== user.id;
  const state = useAtomValue(serverUserSessionsAtom(user.id));
  const refresh = useAtomRefresh(serverUserSessionsAtom(user.id));
  return (
    <>
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h4">User sessions</Text>
        <Button onClick={refresh} enabled={!state.waiting}>
          <Text>Refresh user sessions</Text>
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
        onSuccess: ({ value: { sessions } }) =>
          sessions.length === 0 ? (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">Sessions</Text>
              <Text>No active sessions.</Text>
            </Column>
          ) : (
            sessions.map((session) => (
              <Column key={session.id} verticalArrangement={{ spacedBy: Spacing.two }}>
                <Text variant="h4">Device</Text>
                <SessionDetails session={session} />
                {isOtherUser ? (
                  <MutationConfirmation
                    onFailure={authFailureMessage}
                    trigger={({ open, busy }) => (
                      <TextButton onClick={open} enabled={!busy}>
                        <Text color={colors.error}>Revoke session</Text>
                      </TextButton>
                    )}
                    mutation={revokeServerUserSessionAtom(user.id)}
                    input={{ sessionToken: session.token }}
                    title="Revoke session"
                    message={`Sign out this device for @${user.username}?`}
                  />
                ) : null}
              </Column>
            ))
          ),
      })}
      {isOtherUser ? (
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">Revoke all sessions</Text>
          <MutationConfirmation
            onFailure={authFailureMessage}
            trigger={({ open, busy }) => (
              <TextButton onClick={open} enabled={!busy}>
                <Text color={colors.error}>Sign out all user devices</Text>
              </TextButton>
            )}
            mutation={revokeServerUserSessionsAtom}
            input={{ userId: user.id }}
            title="Sign out all user devices"
            message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
          />
        </Column>
      ) : (
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">Your sessions</Text>
          <Text>Use your profile to sign out your own devices.</Text>
        </Column>
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
  const auth = useAtomValue(accountAuthAtom);
  const isOtherUser = AsyncResult.isSuccess(auth) && auth.value.key.userId !== user.id;
  const [editor, setEditor] = useState<'role' | 'profile' | 'password' | 'ban' | null>(null);
  const colors = useMaterialColors({ seedColor: materialSeedColor });
  return (
    <>
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
        verticalArrangement={{ spacedBy: Spacing.three }}>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">User details</Text>
          <Button onClick={refresh} enabled={!waiting}>
            <Text>Refresh user</Text>
          </Button>
        </Column>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h3">{user.name}</Text>
          <DetailRows details={userDetails({ user })} />
        </Column>
        {isOtherUser ? (
          <>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">Manage user</Text>
              <SegmentedList>
                <SegmentedListItem
                  index={0}
                  count={3}
                  onClick={() => {
                    setEditor('role');
                  }}>
                  <SegmentedListItem.HeadlineContent>
                    <Text>Change role</Text>
                  </SegmentedListItem.HeadlineContent>
                </SegmentedListItem>
                <SegmentedListItem
                  index={1}
                  count={3}
                  onClick={() => {
                    setEditor('profile');
                  }}>
                  <SegmentedListItem.HeadlineContent>
                    <Text>Edit user profile</Text>
                  </SegmentedListItem.HeadlineContent>
                </SegmentedListItem>
                <SegmentedListItem
                  index={2}
                  count={3}
                  onClick={() => {
                    setEditor('password');
                  }}>
                  <SegmentedListItem.HeadlineContent>
                    <Text>Set a new password</Text>
                  </SegmentedListItem.HeadlineContent>
                </SegmentedListItem>
              </SegmentedList>
            </Column>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">Ban status</Text>
              {user.banned === true ? (
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <TextButton onClick={open} enabled={!busy}>
                      <Text>Unban user</Text>
                    </TextButton>
                  )}
                  mutation={unbanServerUserAtom}
                  input={{ userId: user.id }}
                  role="default"
                  title="Unban user"
                  message={`Allow @${user.username} to sign in again? Revoked sessions will not be restored.`}
                />
              ) : (
                <TextButton
                  onClick={() => {
                    setEditor('ban');
                  }}>
                  <Text color={colors.error}>Ban user</Text>
                </TextButton>
              )}
            </Column>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">Delete user</Text>
              <MutationConfirmation
                onFailure={authFailureMessage}
                trigger={({ open, busy }) => (
                  <TextButton onClick={open} enabled={!busy}>
                    <Text color={colors.error}>Delete server user</Text>
                  </TextButton>
                )}
                mutation={deleteServerUserAtom}
                input={{ userId: user.id }}
                title="Delete server user"
                message={`Permanently delete @${user.username} (${user.email}) from this server? Their credentials and sessions will be removed. This cannot be undone.`}
                onSuccess={() => {
                  router.replace('/accounts/server/users');
                }}
              />
            </Column>
          </>
        ) : (
          <Column verticalArrangement={{ spacedBy: Spacing.two }}>
            <Text variant="h4">Manage user</Text>
            <Text>Use your profile to manage your own account.</Text>
          </Column>
        )}
        <UserSessions user={user} />
      </LazyColumn>
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
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
        verticalArrangement={{ spacedBy: Spacing.three }}>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">User</Text>
          <LoadingIndicator />
        </Column>
      </LazyColumn>
    ),
    onError: (error) => (
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
        verticalArrangement={{ spacedBy: Spacing.three }}>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">User</Text>
          <Text>{authFailureMessage({ error })}</Text>
          <Button onClick={refresh} enabled={!state.waiting}>
            <Text>Retry</Text>
          </Button>
        </Column>
      </LazyColumn>
    ),
    onDefect: () => (
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
        verticalArrangement={{ spacedBy: Spacing.three }}>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">User</Text>
          <Text>Unable to load this user. Try refreshing.</Text>
          <Button onClick={refresh} enabled={!state.waiting}>
            <Text>Retry</Text>
          </Button>
        </Column>
      </LazyColumn>
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
    <AndroidAccountsSheet>
      {Option.match(userId, {
        onNone: () => (
          <LazyColumn
            contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
            verticalArrangement={{ spacedBy: Spacing.three }}>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">User</Text>
              <Text>Invalid user ID.</Text>
            </Column>
          </LazyColumn>
        ),
        onSome: (value) => <UserContent key={value} userId={value} />,
      })}
    </AndroidAccountsSheet>
  );
}
