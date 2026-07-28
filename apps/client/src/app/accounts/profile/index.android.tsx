import { useAtomValue } from '@effect/atom-react';
import {
  AlertDialog,
  Button,
  Column,
  LazyColumn,
  LoadingIndicator,
  ModalBottomSheet,
  Row,
  Switch,
  TextButton,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, weight } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  activeUserProfileAtom,
  activeUserSessionsAtom,
  getUserSessionDetails,
  getUserSessionTitle,
  usePasswordResetForm,
  useUserProfileForm,
  useUserSessionActions,
} from '#src/app/accounts/profile/index.ts';
import type { UserSession } from '#src/app/accounts/profile/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <LazyColumn
    verticalArrangement={{ spacedBy: Spacing.two }}
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
    {children}
  </LazyColumn>
);

const UserProfileEditor = ({ onSuccess, profile }: Parameters<typeof useUserProfileForm>[0]) => {
  const form = useUserProfileForm({ onSuccess, profile });

  return (
    <form.AppForm>
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Edit Profile</Text>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label="Name"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: { capitalization: 'words' },
                },
              }}
            />
          )}
        </form.AppField>
        <form.AppField name="username">
          {(field) => (
            <field.TextField
              label="Username"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'ascii',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>
        <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
          <Text>Save Changes</Text>
        </form.SubmitButton>
      </Column>
    </form.AppForm>
  );
};

const PasswordResetEditor = ({ onSuccess }: Parameters<typeof usePasswordResetForm>[0]) => {
  const form = usePasswordResetForm({ onSuccess });

  return (
    <form.AppForm>
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Reset Password</Text>
        <form.AppField name="currentPassword">
          {(field) => (
            <field.SecureField
              label="Current Password"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.SecureField
              label="New Password"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.SecureField
              label="Confirm New Password"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>
        <form.AppField name="revokeOtherSessions">
          {(field) => (
            <Row
              modifiers={[fillMaxWidth()]}
              verticalAlignment="center"
              horizontalArrangement="spaceBetween">
              <Column modifiers={[weight(1)]}>
                <Text>Sign out of other sessions</Text>
                <Text variant="caption">Keep only this device signed in</Text>
              </Column>
              <Switch value={field.state.value === true} onCheckedChange={field.handleChange} />
            </Row>
          )}
        </form.AppField>
        <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
          <Text>Reset Password</Text>
        </form.SubmitButton>
      </Column>
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const editProfileSheetRef = useRef<ModalBottomSheetRef>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const resetPasswordSheetRef = useRef<ModalBottomSheetRef>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<UserSession | null>(null);
  const [isRevokeAllPresented, setIsRevokeAllPresented] = useState(false);
  const sessionsState = useAtomValue(activeUserSessionsAtom);
  const sessionActions = useUserSessionActions();
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <>
      <ProfileList>
        <Text variant="h4">Your Profile</Text>
        <SegmentedList>
          <SegmentedListItem index={0} count={4}>
            <SegmentedListItem.HeadlineContent>
              <Text variant="caption">Name</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.SupportingContent>
              <Text>{name}</Text>
            </SegmentedListItem.SupportingContent>
          </SegmentedListItem>
          <SegmentedListItem index={1} count={4}>
            <SegmentedListItem.HeadlineContent>
              <Text variant="caption">Username</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.SupportingContent>
              <Text>@{username}</Text>
            </SegmentedListItem.SupportingContent>
          </SegmentedListItem>
          <SegmentedListItem index={2} count={4}>
            <SegmentedListItem.HeadlineContent>
              <Text variant="caption">Email</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.SupportingContent>
              <Text>{email}</Text>
            </SegmentedListItem.SupportingContent>
          </SegmentedListItem>
          <SegmentedListItem index={3} count={4}>
            <SegmentedListItem.HeadlineContent>
              <Text variant="caption">Role</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.SupportingContent>
              <Text>{role}</Text>
            </SegmentedListItem.SupportingContent>
          </SegmentedListItem>
        </SegmentedList>
        <Button
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            setIsEditingProfile(true);
          }}>
          <Text>Edit Profile</Text>
        </Button>

        <Text variant="h4">Active Sessions</Text>
        {AsyncResult.matchWithError(sessionsState, {
          onInitial: () => <LoadingIndicator modifiers={[fillMaxWidth()]} />,
          onError: () => <Text>Unable to load active sessions</Text>,
          onDefect: () => <Text>Unable to load active sessions</Text>,
          onSuccess: ({ value }) =>
            Option.match(value, {
              onNone: () => <Text>No active user</Text>,
              onSome: ({ currentSessionToken, sessions }) => (
                <SegmentedList>
                  {sessions.map((session, index) => (
                    <SegmentedListItem
                      key={session.token}
                      index={index}
                      count={sessions.length + 1}
                      enabled={!sessionActions.isWaiting}
                      onClick={() => {
                        setSessionToRevoke(session);
                      }}>
                      <SegmentedListItem.HeadlineContent>
                        <Text>{getUserSessionTitle(session, currentSessionToken)}</Text>
                      </SegmentedListItem.HeadlineContent>
                      <SegmentedListItem.SupportingContent>
                        <Text variant="caption" color={colors.onSurfaceVariant}>
                          {getUserSessionDetails(session)}
                        </Text>
                      </SegmentedListItem.SupportingContent>
                      <SegmentedListItem.TrailingContent>
                        <Text color={colors.error}>Sign Out</Text>
                      </SegmentedListItem.TrailingContent>
                    </SegmentedListItem>
                  ))}
                  <SegmentedListItem
                    index={sessions.length}
                    count={sessions.length + 1}
                    enabled={!sessionActions.isWaiting}
                    onClick={() => {
                      setIsRevokeAllPresented(true);
                    }}>
                    <SegmentedListItem.HeadlineContent>
                      <Text color={colors.error}>Sign Out of All Sessions</Text>
                    </SegmentedListItem.HeadlineContent>
                  </SegmentedListItem>
                </SegmentedList>
              ),
            }),
        })}
        {sessionActions.hasError ? (
          <Text color={colors.error}>Unable to sign out. Try again.</Text>
        ) : null}

        <Text variant="h4">Password</Text>
        <Button
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            setIsResettingPassword(true);
          }}>
          <Text>Reset Password</Text>
        </Button>
      </ProfileList>

      {isEditingProfile ? (
        <ModalBottomSheet
          ref={editProfileSheetRef}
          skipPartiallyExpanded
          onDismissRequest={() => {
            setIsEditingProfile(false);
          }}>
          <Column
            modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
            verticalArrangement={{ spacedBy: Spacing.two }}>
            <UserProfileEditor
              profile={{ name, username }}
              onSuccess={async () => {
                await editProfileSheetRef.current?.hide();
              }}
            />
          </Column>
        </ModalBottomSheet>
      ) : null}

      {isResettingPassword ? (
        <ModalBottomSheet
          ref={resetPasswordSheetRef}
          skipPartiallyExpanded
          onDismissRequest={() => {
            setIsResettingPassword(false);
          }}>
          <Column
            modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
            verticalArrangement={{ spacedBy: Spacing.two }}>
            <PasswordResetEditor
              onSuccess={async () => {
                await resetPasswordSheetRef.current?.hide();
              }}
            />
          </Column>
        </ModalBottomSheet>
      ) : null}

      {sessionToRevoke === null ? null : (
        <AlertDialog
          onDismissRequest={() => {
            setSessionToRevoke(null);
          }}>
          <AlertDialog.Title>
            <Text>Sign out this session?</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Text>This device will no longer have access to your account.</Text>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton
              onClick={() => {
                void sessionActions.revokeSession(sessionToRevoke.token);
                setSessionToRevoke(null);
              }}>
              <Text color={colors.error}>Sign Out</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
          <AlertDialog.DismissButton>
            <TextButton
              onClick={() => {
                setSessionToRevoke(null);
              }}>
              <Text>Cancel</Text>
            </TextButton>
          </AlertDialog.DismissButton>
        </AlertDialog>
      )}

      {isRevokeAllPresented ? (
        <AlertDialog
          onDismissRequest={() => {
            setIsRevokeAllPresented(false);
          }}>
          <AlertDialog.Title>
            <Text>Sign out of all sessions?</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Text>You will be signed out on this device and every other device.</Text>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton
              onClick={() => {
                void sessionActions.revokeAllSessions();
                setIsRevokeAllPresented(false);
              }}>
              <Text color={colors.error}>Sign Out All</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
          <AlertDialog.DismissButton>
            <TextButton
              onClick={() => {
                setIsRevokeAllPresented(false);
              }}>
              <Text>Cancel</Text>
            </TextButton>
          </AlertDialog.DismissButton>
        </AlertDialog>
      ) : null}
    </>
  );
};

export default function ProfileScreen() {
  const state = useAtomValue(activeUserProfileAtom);

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
            <Text>Unable to load the user profile</Text>
          </ProfileList>
        ),
        onDefect: () => (
          <ProfileList>
            <Text>Unable to load the user profile</Text>
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
