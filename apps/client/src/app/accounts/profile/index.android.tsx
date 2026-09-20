import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Column, Icon, LazyColumn, LoadingIndicator, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match, Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  activeUserProfileAtom,
  ownSessionsAtom,
  signOutEverywhereAtom,
  useChangePasswordForm,
  useUserProfileForm,
} from '#src/app/accounts/profile/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
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
import { activeAccountAtom } from '#src/services/accounts/atoms.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <LazyColumn
    verticalArrangement={{ spacedBy: Spacing.two }}
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
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
      </FormLayout>
    </form.AppForm>
  );
};

const LoadedProfile = ({
  profile: { email, name, role, username },
}: {
  profile: Pick<
    Option.Option.Value<Atom.Success<typeof activeUserProfileAtom>>,
    'email' | 'name' | 'role' | 'username'
  >;
}) => {
  const [editor, setEditor] = useState<'profile' | 'password' | null>(null);
  const colors = useMaterialColors();

  return (
    <>
      <ProfileList>
        <Text variant="h4">Your Profile</Text>
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

        <OwnSessions />

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
            mutation={signOutEverywhereAtom}
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
              <UserProfileEditor profile={{ name, username }} onSuccess={close} />
            )),
            Match.when('password', () => <PasswordForm onSuccess={close} />),
            Match.when(null, () => null),
            Match.exhaustive
          )
        }
      </ControlledSheet>
    </>
  );
};

export default function ProfileScreen() {
  const state = useAtomValue(activeUserProfileAtom);
  const refresh = useAtomRefresh(activeAccountAtom);

  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(state, {
        onInitial: () => (
          <ProfileList>
            <LoadingIndicator modifiers={[fillMaxWidth()]} />
          </ProfileList>
        ),
        onError: () => (
          <ProfileList>
            <Text>Unable to load your profile.</Text>
            <TextButton onClick={refresh} enabled={!state.waiting}>
              <Text>Retry</Text>
            </TextButton>
          </ProfileList>
        ),
        onDefect: () => (
          <ProfileList>
            <Text>Unable to load your profile.</Text>
            <TextButton onClick={refresh} enabled={!state.waiting}>
              <Text>Retry</Text>
            </TextButton>
          </ProfileList>
        ),
        onSuccess: ({ value }) =>
          Option.match(value, {
            onNone: () => (
              <ProfileList>
                <Text>No active user</Text>
              </ProfileList>
            ),
            onSome: (profile) => <LoadedProfile key={profile.id} profile={profile} />,
          }),
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
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              purpose="newPassword"
              label="New password"
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

const OwnSessions = () => {
  const state = useAtomValue(ownSessionsAtom);
  const refresh = useAtomRefresh(ownSessionsAtom);
  return (
    <>
      <Text variant="h4">Active Sessions</Text>
      {AsyncResult.matchWithError(state, {
        onInitial: () => <LoadingIndicator />,
        onError: (error) => (
          <Column>
            <Text>{authFailureMessage({ error })}</Text>
            <TextButton onClick={refresh} enabled={!state.waiting}>
              <Text>Retry</Text>
            </TextButton>
          </Column>
        ),
        onDefect: () => (
          <Column>
            <Text>Unable to load sessions.</Text>
            <TextButton onClick={refresh} enabled={!state.waiting}>
              <Text>Retry</Text>
            </TextButton>
          </Column>
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
