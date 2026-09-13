import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Column, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match, Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthUser } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormSheet } from '#src/components/form-sheet';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import {
  deleteServerUserAtom,
  serverUserAtom,
  unbanServerUserAtom,
} from '#src/features/accounts/server-users/user-atoms.ts';
import { UserSessions } from '#src/features/accounts/server-users/user-sessions';
import { accountAuthAtom } from '#src/features/accounts/shared/atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';
import { ConfirmAccountAction } from '#src/features/accounts/shared/confirm-account-action';

import { editorTitles } from './editor-titles.ts';
import { BanForm } from './user-ban-form.tsx';
import { userDetailRows } from './user-details.ts';
import { PasswordForm } from './user-password-form.tsx';
import { ProfileForm } from './user-profile-form.tsx';
import { RoleForm } from './user-role-form.tsx';

const UserDetails = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => {
  const rows = userDetailRows(user);
  return (
    <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
      <Text variant="h4">{user.name}</Text>
      <SegmentedList>
        {rows.map(({ label, value }, index) => (
          <SegmentedListItem key={label} index={index} count={rows.length}>
            <SegmentedListItem.HeadlineContent>
              <Text variant="caption">{label}</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.SupportingContent>
              <Text>{value}</Text>
            </SegmentedListItem.SupportingContent>
          </SegmentedListItem>
        ))}
      </SegmentedList>
    </Column>
  );
};

const OtherUserActions = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => {
  const auth = useAtomValue(accountAuthAtom);
  const [editor, setEditor] = useState<keyof typeof editorTitles | null>(null);
  if (!AsyncResult.isSuccess(auth) || auth.value.key.userId === user.id) {
    return (
      <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
        <Text variant="h4">Manage user</Text>
        <Text>Use your profile to manage your own account.</Text>
      </Column>
    );
  }
  return (
    <>
      <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
        <Text variant="h4">Manage user</Text>
        {(['profile', 'role', 'password'] as const).map((kind) => (
          <Button
            key={kind}
            onClick={() => {
              setEditor(kind);
            }}
            modifiers={[fillMaxWidth()]}>
            <Text>{editorTitles[kind]}</Text>
          </Button>
        ))}
        {user.banned === true ? (
          <ConfirmAccountAction
            mutation={unbanServerUserAtom}
            input={{ userId: user.id }}
            title="Unban user"
            intent="default"
            confirmLabel="Unban"
            successMessage="User unbanned."
            message={`Allow @${user.username} to sign in again? Revoked sessions will not be restored.`}
          />
        ) : (
          <Button
            onClick={() => {
              setEditor('ban');
            }}
            modifiers={[fillMaxWidth()]}>
            <Text>{editorTitles.ban}</Text>
          </Button>
        )}
      </Column>
      <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
        <Text variant="h4">Delete user</Text>
        <ConfirmAccountAction
          mutation={deleteServerUserAtom}
          input={{ userId: user.id }}
          title="Delete server user"
          intent="destructive"
          confirmLabel="Delete user"
          successMessage="User deleted."
          message={`Permanently delete @${user.username} (${user.email}) from this server? Their credentials and sessions will be removed. This cannot be undone.`}
          onSuccess={() => {
            router.replace('/accounts/server/users');
          }}
        />
      </Column>
      <FormSheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
          }
        }}>
        {(close) =>
          Match.value(editor).pipe(
            Match.when('profile', () => <ProfileForm user={user} onSuccess={close} />),
            Match.when('role', () => <RoleForm user={user} onSuccess={close} />),
            Match.when('password', () => <PasswordForm userId={user.id} onSuccess={close} />),
            Match.when('ban', () => <BanForm user={user} onSuccess={close} />),
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </FormSheet>
    </>
  );
};

const LoadedUserScreen = ({ userId }: { userId: typeof AuthUser.fields.id.Type }) => {
  const state = useAtomValue(serverUserAtom(userId));
  const refresh = useAtomRefresh(serverUserAtom(userId));
  return (
    <AndroidAccountsSheet>
      <LazyColumn
        verticalArrangement={{ spacedBy: Spacing.three }}
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
          <Text variant="h4">User details</Text>
          <Button onClick={refresh} enabled={!state.waiting} modifiers={[fillMaxWidth()]}>
            <Text>Refresh user</Text>
          </Button>
        </Column>
        {AsyncResult.matchWithError(state, {
          onInitial: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
              <Text variant="h4">User</Text>
              <Text>Loading user…</Text>
            </Column>
          ),
          onError: (error) => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
              <Text variant="h4">User</Text>
              <Text>{authFailureMessage({ error })}</Text>
            </Column>
          ),
          onDefect: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
              <Text variant="h4">User</Text>
              <Text>Unable to load this user. Try refreshing.</Text>
            </Column>
          ),
          onSuccess: ({ value }) => (
            <>
              <UserDetails user={value} />
              <OtherUserActions user={value} />
              <UserSessions user={value} />
            </>
          ),
        })}
      </LazyColumn>
    </AndroidAccountsSheet>
  );
};

export default function ServerUserScreen() {
  const { id } = useLocalSearchParams();
  const userId = Schema.decodeUnknownOption(AuthUser.fields.id.check(Schema.isNonEmpty()))(id);
  return Option.match(userId, {
    onNone: () => (
      <AndroidAccountsSheet>
        <LazyColumn
          verticalArrangement={{ spacedBy: Spacing.three }}
          contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
          <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
            <Text variant="h4">User</Text>
            <Text>Invalid user ID.</Text>
          </Column>
        </LazyColumn>
      </AndroidAccountsSheet>
    ),
    onSome: (value) => <LoadedUserScreen key={value} userId={value} />,
  });
}
