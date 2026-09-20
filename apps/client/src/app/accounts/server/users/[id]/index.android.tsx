import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Column, Icon, LazyColumn, LoadingIndicator, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import { AuthUserIdInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

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
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

const UserList = ({ children }: PropsWithChildren) => (
  <LazyColumn
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
    verticalArrangement={{ spacedBy: Spacing.two }}>
    {children}
  </LazyColumn>
);

const UserPasswordForm = (props: Parameters<typeof useUserPasswordForm>[0]) => {
  const form = useUserPasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Set password"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Set password</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="New password"
              placeholder="unguessableThisTime!"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="Confirm new password"
              placeholder="unguessableThisTime!"
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
        title="Edit profile"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save changes</Text>
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

const UserSessions = ({ user }: { user: typeof AuthUser.Type }) => {
  const colors = useMaterialColors();
  const state = useAtomValue(serverUserSessionsAtom(user.id));
  const refresh = useAtomRefresh(serverUserSessionsAtom(user.id));
  return (
    <Column verticalArrangement={{ spacedBy: Spacing.two }}>
      <Text variant="h4">Active Sessions</Text>
      {AsyncResult.matchWithError(state, {
        onInitial: () => <LoadingIndicator modifiers={[fillMaxWidth()]} />,
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
            <Text>Unable to load sessions.</Text>
            <TextButton onClick={refresh} enabled={!state.waiting}>
              <Text>Retry</Text>
            </TextButton>
          </>
        ),
        onSuccess: ({ value: { sessions } }) => (
          <>
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
            {sessions.length > 0 ? (
              <SegmentedList>
                <MutationConfirmation
                  onFailure={authFailureMessage}
                  trigger={({ open, busy }) => (
                    <SegmentedListItem index={0} count={1} onClick={open} enabled={!busy}>
                      <SegmentedListItem.HeadlineContent>
                        <Text color={colors.error}>Sign out all devices</Text>
                      </SegmentedListItem.HeadlineContent>
                    </SegmentedListItem>
                  )}
                  mutation={revokeServerUserSessionsAtom}
                  schema={AuthUserIdInput}
                  defaultValues={{ userId: user.id }}
                  title="Sign out all devices"
                  confirmLabel="Sign out"
                  message={`Sign out all devices for @${user.username}? They will need to sign in again.`}
                />
              </SegmentedList>
            ) : null}
          </>
        ),
      })}
    </Column>
  );
};

const LoadedUser = ({
  user,
}: {
  readonly user: Atom.Success<ReturnType<typeof serverUserAtom>>;
}) => {
  const details = userDetails({ user });
  const [editor, setEditor] = useState<'role' | 'profile' | 'password' | null>(null);
  const colors = useMaterialColors();
  return (
    <>
      <UserList>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h4">User Details</Text>
          <DetailRows details={details} />
        </Column>
        {user.isOtherUser ? (
          <>
            <SegmentedList>
              <SegmentedListItem
                index={0}
                count={4}
                onClick={() => {
                  setEditor('profile');
                }}>
                <SegmentedListItem.HeadlineContent>
                  <Text>Edit profile</Text>
                </SegmentedListItem.HeadlineContent>
                <SegmentedListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </SegmentedListItem.TrailingContent>
              </SegmentedListItem>
              <SegmentedListItem
                index={1}
                count={4}
                onClick={() => {
                  setEditor('role');
                }}>
                <SegmentedListItem.HeadlineContent>
                  <Text>Change role</Text>
                </SegmentedListItem.HeadlineContent>
                <SegmentedListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </SegmentedListItem.TrailingContent>
              </SegmentedListItem>
              <SegmentedListItem
                index={2}
                count={4}
                onClick={() => {
                  setEditor('password');
                }}>
                <SegmentedListItem.HeadlineContent>
                  <Text>Set password</Text>
                </SegmentedListItem.HeadlineContent>
                <SegmentedListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </SegmentedListItem.TrailingContent>
              </SegmentedListItem>
              <MutationConfirmation
                onFailure={authFailureMessage}
                trigger={({ open, busy }) => (
                  <SegmentedListItem index={3} count={4} onClick={open} enabled={!busy}>
                    <SegmentedListItem.HeadlineContent>
                      <Text color={colors.error}>Delete user</Text>
                    </SegmentedListItem.HeadlineContent>
                  </SegmentedListItem>
                )}
                mutation={deleteServerUserAtom}
                schema={AuthUserIdInput}
                defaultValues={{ userId: user.id }}
                title="Delete user"
                confirmLabel="Delete"
                message={`Permanently delete @${user.username} (${user.email}) from this server? Their credentials and sessions will be removed. This cannot be undone.`}
                onSuccess={() => {
                  router.dismissTo('/accounts/server/users');
                }}
              />
            </SegmentedList>
            <UserSessions user={user} />
          </>
        ) : (
          <Column verticalArrangement={{ spacedBy: Spacing.two }}>
            <SegmentedList>
              <SegmentedListItem
                index={0}
                count={1}
                onClick={() => {
                  router.push('/accounts/profile');
                }}>
                <SegmentedListItem.HeadlineContent>
                  <Text>Go to profile</Text>
                </SegmentedListItem.HeadlineContent>
                <SegmentedListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </SegmentedListItem.TrailingContent>
              </SegmentedListItem>
            </SegmentedList>
            <Text variant="caption" color={colors.onSurfaceVariant}>
              Manage your profile and signed-in devices from your profile.
            </Text>
          </Column>
        )}
      </UserList>
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
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </ControlledSheet>
    </>
  );
};

export default function ServerUserScreen() {
  const { id } = useLocalSearchParams<{ id: typeof AuthUser.fields.id.Type }>();
  const state = useAtomValue(serverUserAtom(id));
  const refresh = useAtomRefresh(serverUserAtom(id));

  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <UserList>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">User Details</Text>
              <LoadingIndicator modifiers={[fillMaxWidth()]} />
            </Column>
          </UserList>
        ),
        onError: (error) => (
          <UserList>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">User Details</Text>
              <Text>{authFailureMessage({ error })}</Text>
              <TextButton onClick={refresh} enabled={!state.waiting}>
                <Text>Retry</Text>
              </TextButton>
            </Column>
          </UserList>
        ),
        onDefect: () => (
          <UserList>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h4">User Details</Text>
              <Text>Unable to load this user.</Text>
              <TextButton onClick={refresh} enabled={!state.waiting}>
                <Text>Retry</Text>
              </TextButton>
            </Column>
          </UserList>
        ),
        onSuccess: ({ value }) => <LoadedUser key={value.id} user={value} />,
      })}
    </AndroidAccountsSheet>
  );
}
