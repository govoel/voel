import { useAtomRefresh, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match, Option } from 'effect';
import type { Atom } from 'effect/reactivity';
import { AsyncResult } from 'effect/reactivity';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  ownSessionsAtom,
  signOutEverywhereAtom,
  useChangePasswordForm,
  useUserProfileForm,
  userProfileAtom,
} from '#src/app/accounts/profile/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { SessionList } from '#src/components/account-management/session-list';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { DetailRows } from '#src/components/detail-rows';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { accountAtom, activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import type { AccountStorageKey } from '#src/services/accounts/index.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <LazyColumn
    verticalArrangement={{ spacedBy: Spacing.two }}
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
    <Text variant="h4">Your Profile</Text>
    {children}
  </LazyColumn>
);

const UserProfileEditor = (props: Parameters<typeof useUserProfileForm>[0]) => {
  const form = useUserProfileForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Edit Profile"
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
              placeholder="Still You"
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
              placeholder="stillYou"
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

const LoadedProfile = ({
  accountKey,
  profile: { email, name, role, username },
}: {
  accountKey: AccountStorageKey;
  profile: Pick<
    Option.Option.Value<Atom.Success<ReturnType<typeof userProfileAtom>>>,
    'email' | 'name' | 'role' | 'username'
  >;
}) => {
  const router = useRouter();
  const [editor, setEditor] = useState<'profile' | 'password' | null>(null);
  const colors = useMaterialColors();

  return (
    <>
      <ProfileList>
        <DetailRows
          details={[
            { label: 'Name', value: name },
            { label: 'Username', value: `@${username}` },
            { label: 'Email', value: email },
            { label: 'Role', value: role },
          ]}
        />
        <SegmentedList>
          <SegmentedListItem
            index={0}
            count={2}
            onClick={() => {
              setEditor('profile');
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>Edit profile</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              <Icon source={ChevronRight} size={24} />
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
          <SegmentedListItem
            index={1}
            count={2}
            onClick={() => {
              setEditor('password');
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>Change password</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.TrailingContent>
              <Icon source={ChevronRight} size={24} />
            </SegmentedListItem.TrailingContent>
          </SegmentedListItem>
        </SegmentedList>

        <OwnSessions accountKey={accountKey} />

        <SegmentedList>
          <MutationConfirmation
            onFailure={authFailureMessage}
            trigger={({ open, busy }) => (
              <SegmentedListItem index={0} count={1} onClick={open} enabled={!busy}>
                <SegmentedListItem.HeadlineContent>
                  <Text color={colors.error}>Sign out everywhere</Text>
                </SegmentedListItem.HeadlineContent>
              </SegmentedListItem>
            )}
            mutation={signOutEverywhereAtom(accountKey)}
            title="Sign out everywhere"
            confirmLabel="Sign out"
            message="Sign out all devices for this account on this server, including this device?"
            onSuccess={() => {
              router.dismissTo('/accounts');
            }}
          />
        </SegmentedList>
      </ProfileList>

      <ControlledSheet
        presented={editor !== null}
        onDismiss={() => {
          setEditor(null);
        }}>
        {({ close }) =>
          Match.value(editor).pipe(
            Match.when('profile', () => (
              <UserProfileEditor
                accountKey={accountKey}
                profile={{ name, username }}
                onSuccess={close}
              />
            )),
            Match.when('password', () => (
              <PasswordForm accountKey={accountKey} onSuccess={close} />
            )),
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </ControlledSheet>
    </>
  );
};

const ProfileContent = ({ accountKey }: { accountKey: AccountStorageKey }) => {
  const state = useAtomValue(userProfileAtom(accountKey));
  const refresh = useAtomRefresh(accountAtom(accountKey));
  return AsyncResult.matchWithError(state, {
    onInitial: () => (
      <ProfileList>
        <ListState kind="loading" />
      </ProfileList>
    ),
    onError: () => (
      <ProfileList>
        <ListState
          kind="error"
          message="Unable to load your profile."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </ProfileList>
    ),
    onDefect: () => (
      <ProfileList>
        <ListState
          kind="error"
          message="Unable to load your profile."
          onRetry={refresh}
          retrying={state.waiting}
        />
      </ProfileList>
    ),
    onSuccess: ({ value }) =>
      Option.match(value, {
        onNone: () => (
          <ProfileList>
            <ListState kind="empty" message="No active user." />
          </ProfileList>
        ),
        onSome: (profile) => (
          <LoadedProfile
            key={JSON.stringify([accountKey, profile.id])}
            accountKey={accountKey}
            profile={profile}
          />
        ),
      }),
  });
};

export default function ProfileScreen() {
  const accountKey = useAtomSuspense(activeAccountKeyAtom).value;

  return (
    <AndroidAccountsSheet>
      {Option.match(accountKey, {
        onNone: () => (
          <ProfileList>
            <ListState kind="empty" message="No active user." />
          </ProfileList>
        ),
        onSome: (key) => <ProfileContent key={JSON.stringify(key)} accountKey={key} />,
      })}
    </AndroidAccountsSheet>
  );
}

const PasswordForm = (props: Parameters<typeof useChangePasswordForm>[0]) => {
  const form = useChangePasswordForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Change password"
        footer={
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Save password</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="currentPassword">
          {(field) => (
            <field.SecureField
              purpose="currentPassword"
              label="Current password"
              placeholder="ha!NiceTry"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="New password"
              placeholder="notThisTime!"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="Confirm new password"
              placeholder="notThisTime!"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
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
    <>
      <Text variant="h4">Active Sessions</Text>
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
    </>
  );
};
