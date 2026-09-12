import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { DateTime, Option, Predicate, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useLocalSearchParams } from 'expo-router';

import { AuthUser } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { accountAuthAtom, authFailureMessage } from '#src/components/account-management/atoms.ts';
import { Action, Page, Panel } from '#src/components/account-management/ui';
import { serverUserAtom } from '#src/components/account-management/user-atoms.ts';
import { UserBan } from '#src/components/account-management/user-ban.tsx';
import { UserDelete } from '#src/components/account-management/user-delete.tsx';
import { UserPassword } from '#src/components/account-management/user-password.tsx';
import { UserProfile } from '#src/components/account-management/user-profile.tsx';
import { UserRole } from '#src/components/account-management/user-role.tsx';
import { UserSessions } from '#src/components/account-management/user-sessions.tsx';
import { Text } from '#src/components/text';

const UserDetails = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => (
  <Panel title={user.name}>
    <Text>User ID: {user.id}</Text>
    <Text>Username: @{user.username}</Text>
    <Text>Name: {user.name}</Text>
    <Text>Email: {user.email}</Text>
    <Text>Email verified: {user.emailVerified ? 'Yes' : 'No'}</Text>
    <Text>Role: {user.role}</Text>
    <Text>Profile image: {Option.getOrElse(Option.fromNullishOr(user.image), () => 'None')}</Text>
    <Text>Created: {DateTime.formatIso(user.createdAt)}</Text>
    <Text>Updated: {DateTime.formatIso(user.updatedAt)}</Text>
    <Text>Banned: {user.banned === true ? 'Yes' : 'No'}</Text>
    <Text>Ban reason: {user.banReason ?? 'None'}</Text>
    <Text>
      Ban expires:{' '}
      {!Predicate.isNotNullish(user.banExpires) ? 'Never' : DateTime.formatIso(user.banExpires)}
    </Text>
  </Panel>
);

const OtherUserActions = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => {
  const auth = useAtomValue(accountAuthAtom);
  if (!AsyncResult.isSuccess(auth) || auth.value.key.userId === user.id) {
    return (
      <Panel title="Manage user">
        <Text>Use your profile to manage your own account.</Text>
      </Panel>
    );
  }
  return (
    <>
      <UserRole user={user} />
      <UserProfile user={user} />
      <UserPassword user={user} />
      <UserBan user={user} />
      <UserDelete user={user} />
    </>
  );
};

const LoadedUserScreen = ({ userId }: { userId: typeof AuthUser.fields.id.Type }) => {
  const state = useAtomValue(serverUserAtom(userId));
  const refresh = useAtomRefresh(serverUserAtom(userId));
  return (
    <Page>
      <Panel title="User details">
        <Action title="Refresh user" onPress={refresh} busy={state.waiting} />
      </Panel>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <Panel title="User">
            <Text>Loading user…</Text>
          </Panel>
        ),
        onError: (error) => (
          <Panel title="User">
            <Text>{authFailureMessage({ error })}</Text>
          </Panel>
        ),
        onDefect: () => (
          <Panel title="User">
            <Text>Unable to load this user. Try refreshing.</Text>
          </Panel>
        ),
        onSuccess: ({ value }) => (
          <>
            <UserDetails user={value} />
            <OtherUserActions user={value} />
            <UserSessions user={value} />
          </>
        ),
      })}
    </Page>
  );
};

export default function ServerUserScreen() {
  const { id } = useLocalSearchParams();
  const userId = Schema.decodeUnknownOption(AuthUser.fields.id.check(Schema.isNonEmpty()))(id);
  return Option.match(userId, {
    onNone: () => (
      <Page>
        <Panel title="User">
          <Text>Invalid user ID.</Text>
        </Panel>
      </Page>
    ),
    onSome: (value) => <LoadedUserScreen key={value} userId={value} />,
  });
}
