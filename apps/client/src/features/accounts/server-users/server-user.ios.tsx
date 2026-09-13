import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Button, Host, LabeledContent, List, Section } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Match, Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthUser } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { FormSheet } from '#src/components/form-sheet';
import { Text } from '#src/components/text';
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

const UserDetails = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => (
  <Section title={user.name}>
    {userDetailRows(user).map(({ label, value }) => (
      <LabeledContent key={label} label={label}>
        <Text>{value}</Text>
      </LabeledContent>
    ))}
  </Section>
);

const OtherUserActions = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => {
  const auth = useAtomValue(accountAuthAtom);
  const [editor, setEditor] = useState<keyof typeof editorTitles | null>(null);
  if (!AsyncResult.isSuccess(auth) || auth.value.key.userId === user.id) {
    return (
      <Section title="Manage user">
        <Text>Use your profile to manage your own account.</Text>
      </Section>
    );
  }
  return (
    <>
      <Section title="Manage user">
        {(['profile', 'role', 'password'] as const).map((kind) => (
          <Button
            key={kind}
            onPress={() => {
              setEditor(kind);
            }}>
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
            onPress={() => {
              setEditor('ban');
            }}>
            <Text>{editorTitles.ban}</Text>
          </Button>
        )}
      </Section>
      <Section title="Delete user">
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
      </Section>
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
    <Host style={{ flex: 1 }}>
      <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
        <Section title="User details">
          <Button onPress={refresh} modifiers={[disabled(state.waiting)]}>
            <Text>Refresh user</Text>
          </Button>
        </Section>
        {AsyncResult.matchWithError(state, {
          onInitial: () => (
            <Section title="User">
              <Text>Loading user…</Text>
            </Section>
          ),
          onError: (error) => (
            <Section title="User">
              <Text>{authFailureMessage({ error })}</Text>
            </Section>
          ),
          onDefect: () => (
            <Section title="User">
              <Text>Unable to load this user. Try refreshing.</Text>
            </Section>
          ),
          onSuccess: ({ value }) => (
            <>
              <UserDetails user={value} />
              <OtherUserActions user={value} />
              <UserSessions user={value} />
            </>
          ),
        })}
      </List>
    </Host>
  );
};

export default function ServerUserScreen() {
  const { id } = useLocalSearchParams();
  const userId = Schema.decodeUnknownOption(AuthUser.fields.id.check(Schema.isNonEmpty()))(id);
  return Option.match(userId, {
    onNone: () => (
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <Section title="User">
            <Text>Invalid user ID.</Text>
          </Section>
        </List>
      </Host>
    ),
    onSome: (value) => <LoadedUserScreen key={value} userId={value} />,
  });
}
