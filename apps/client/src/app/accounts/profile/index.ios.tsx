import { useAtomValue } from '@effect/atom-react';
import {
  BottomSheet,
  Button,
  Group,
  HStack,
  Host,
  LabeledContent,
  List,
  ProgressView,
  Section,
  Spacer,
  Toggle,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  buttonStyle,
  containerRelativeFrame,
  disabled,
  fixedSize,
  foregroundStyle,
  frame,
  headerProminence,
  keyboardType,
  padding,
  textContentType,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';
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
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
    {children}
  </List>
);

const UserProfileEditor = ({ onSuccess, profile }: Parameters<typeof useUserProfileForm>[0]) => {
  const form = useUserProfileForm({ onSuccess, profile });

  return (
    <form.AppForm>
      <ZStack alignment="bottom">
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <Section
            header={
              <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
                Edit Profile
              </Text>
            }>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name"
                  platformProps={{ ios: { modifiers: [textContentType('name')] } }}
                />
              )}
            </form.AppField>
            <form.AppField name="username">
              {(field) => (
                <field.TextField
                  label="Username"
                  platformProps={{
                    ios: {
                      modifiers: [
                        keyboardType('ascii-capable'),
                        textContentType('username'),
                        textInputAutocapitalization('never'),
                        autocorrectionDisabled(),
                      ],
                    },
                  }}
                />
              )}
            </form.AppField>
          </Section>
        </List>
        <VStack
          spacing={Spacing.two}
          modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save Changes</Text>
          </form.SubmitButton>
        </VStack>
      </ZStack>
    </form.AppForm>
  );
};

const PasswordResetEditor = ({ onSuccess }: Parameters<typeof usePasswordResetForm>[0]) => {
  const form = usePasswordResetForm({ onSuccess });

  return (
    <form.AppForm>
      <ZStack alignment="bottom">
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <Section
            header={
              <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
                Reset Password
              </Text>
            }>
            <form.AppField name="currentPassword">
              {(field) => (
                <field.SecureField
                  label="Current Password"
                  platformProps={{ ios: { modifiers: [textContentType('password')] } }}
                />
              )}
            </form.AppField>
            <form.AppField name="newPassword">
              {(field) => (
                <field.SecureField
                  label="New Password"
                  platformProps={{ ios: { modifiers: [textContentType('newPassword')] } }}
                />
              )}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => (
                <field.SecureField
                  label="Confirm New Password"
                  platformProps={{ ios: { modifiers: [textContentType('newPassword')] } }}
                />
              )}
            </form.AppField>
            <form.AppField name="revokeOtherSessions">
              {(field) => (
                <Toggle isOn={field.state.value === true} onIsOnChange={field.handleChange}>
                  <Text>Sign out of other sessions</Text>
                  <Text variant="caption">Keep only this device signed in</Text>
                </Toggle>
              )}
            </form.AppField>
          </Section>
        </List>
        <VStack
          spacing={Spacing.two}
          modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Reset Password</Text>
          </form.SubmitButton>
        </VStack>
      </ZStack>
    </form.AppForm>
  );
};

type SessionRevocation =
  | { readonly type: 'all' }
  | { readonly type: 'single'; readonly currentSessionToken: string; readonly token: string };

const UserSessionsSection = ({
  onRequestRevoke,
}: {
  readonly onRequestRevoke: (revocation: SessionRevocation) => void;
}) => {
  const sessionsState = useAtomValue(activeUserSessionsAtom);
  const sessionActions = useUserSessionActions();

  return (
    <Section title="Active Sessions">
      {AsyncResult.matchWithError(sessionsState, {
        onInitial: () => (
          <ProgressView
            modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
          />
        ),
        onError: () => <Text>Unable to load active sessions</Text>,
        onDefect: () => <Text>Unable to load active sessions</Text>,
        onSuccess: ({ value }) =>
          Option.match(value, {
            onNone: () => <Text>No active user</Text>,
            onSome: ({ currentSessionToken, sessions }) => (
              <>
                {sessions.length === 0 ? <Text>No active sessions</Text> : null}
                {sessions.map((session) => (
                  <Button
                    modifiers={[tint('primary'), disabled(sessionActions.isWaiting)]}
                    key={session.token}
                    onPress={() => {
                      onRequestRevoke({
                        type: 'single',
                        currentSessionToken,
                        token: session.token,
                      });
                    }}>
                    <HStack alignment="center" spacing={Spacing.two}>
                      <VStack alignment="leading" spacing={Spacing.one}>
                        <Text>{getUserSessionTitle(session, currentSessionToken)}</Text>
                        <Text
                          variant="caption"
                          modifiers={[
                            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                          ]}>
                          {getUserSessionDetails(session)}
                        </Text>
                      </VStack>
                      <Spacer />
                      <Text modifiers={[foregroundStyle('red')]}>Sign Out</Text>
                    </HStack>
                  </Button>
                ))}
              </>
            ),
          }),
      })}

      <Button
        label="Sign Out of All Sessions"
        role="destructive"
        modifiers={[disabled(sessionActions.isWaiting)]}
        onPress={() => {
          onRequestRevoke({ type: 'all' });
        }}
      />

      {sessionActions.hasError ? (
        <Text modifiers={[foregroundStyle('red')]}>Unable to sign out. Try again.</Text>
      ) : null}
    </Section>
  );
};

const SessionRevocationSheet = ({
  revocation,
  onDismiss,
}: {
  readonly revocation: SessionRevocation;
  readonly onDismiss: () => void;
}) => {
  const sessionActions = useUserSessionActions();
  const isCurrentSession =
    revocation.type === 'single' && revocation.token === revocation.currentSessionToken;
  const description = (() => {
    if (revocation.type === 'all') {
      return 'You will be signed out on this device and every other device.';
    }
    if (isCurrentSession) {
      return 'You will be signed out on this device.';
    }
    return 'This device will no longer have access to your account.';
  })();

  return (
    <VStack
      alignment="leading"
      spacing={Spacing.two}
      modifiers={[padding({ horizontal: Spacing.three, top: Spacing.four })]}>
      <Text variant="h3">
        {revocation.type === 'all' ? 'Sign out of all sessions?' : 'Sign out this session?'}
      </Text>
      <Text
        modifiers={[
          fixedSize({ horizontal: false, vertical: true }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}>
        {description}
      </Text>
      <Button
        role="destructive"
        modifiers={[buttonStyle('bordered'), disabled(sessionActions.isWaiting)]}
        onPress={() => {
          if (revocation.type === 'all') {
            void sessionActions.revokeAllSessions();
          } else {
            void sessionActions.revokeSession(revocation.token);
          }
          onDismiss();
        }}>
        <Text modifiers={[frame({ maxWidth: Infinity })]}>
          {revocation.type === 'all' ? 'Sign Out All' : 'Sign Out'}
        </Text>
      </Button>
      <Button role="cancel" modifiers={[buttonStyle('bordered')]} onPress={onDismiss}>
        <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
      </Button>
    </VStack>
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
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [sessionRevocation, setSessionRevocation] = useState<SessionRevocation | null>(null);

  return (
    <>
      <ZStack alignment="bottom">
        <ProfileList>
          <Section title="Your Profile">
            <LabeledContent label="Name">
              <Text
                modifiers={[
                  foregroundStyle({
                    type: 'hierarchical',
                    style: 'secondary',
                  }),
                ]}>
                {name}
              </Text>
            </LabeledContent>
            <LabeledContent label="Username">
              <Text
                modifiers={[
                  foregroundStyle({
                    type: 'hierarchical',
                    style: 'secondary',
                  }),
                ]}>
                @{username}
              </Text>
            </LabeledContent>
            <LabeledContent label="Email">
              <Text
                modifiers={[
                  foregroundStyle({
                    type: 'hierarchical',
                    style: 'secondary',
                  }),
                ]}>
                {email}
              </Text>
            </LabeledContent>
            <LabeledContent label="Role">
              <Text
                modifiers={[
                  foregroundStyle({
                    type: 'hierarchical',
                    style: 'secondary',
                  }),
                ]}>
                {role}
              </Text>
            </LabeledContent>
          </Section>
          <UserSessionsSection onRequestRevoke={setSessionRevocation} />
          <Section title="Password">
            <Button
              modifiers={[tint('primary')]}
              label="Reset Password"
              onPress={() => {
                setIsResettingPassword(true);
              }}
            />
          </Section>
        </ProfileList>

        <VStack modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
          <Button
            modifiers={[buttonStyle('borderedProminent')]}
            onPress={() => {
              setIsEditingProfile(true);
            }}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>Edit Profile</Text>
          </Button>
        </VStack>
      </ZStack>

      <BottomSheet isPresented={isEditingProfile} onIsPresentedChange={setIsEditingProfile}>
        {/* Unmount the editor when dismissed so each presentation starts with fresh form state. */}
        {isEditingProfile ? (
          <UserProfileEditor
            profile={{ name, username }}
            onSuccess={async () => {
              setIsEditingProfile(false);
            }}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        isPresented={isResettingPassword}
        onIsPresentedChange={(isPresented) => {
          setIsResettingPassword(isPresented);
        }}>
        {isResettingPassword ? (
          <PasswordResetEditor
            onSuccess={async () => {
              setIsResettingPassword(false);
            }}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        fitToContents
        isPresented={sessionRevocation !== null}
        onIsPresentedChange={(isPresented) => {
          if (!isPresented) {
            setSessionRevocation(null);
          }
        }}>
        {sessionRevocation === null ? null : (
          <SessionRevocationSheet
            revocation={sessionRevocation}
            onDismiss={() => {
              setSessionRevocation(null);
            }}
          />
        )}
      </BottomSheet>
    </>
  );
};

export default function ProfileScreen() {
  const state = useAtomValue(activeUserProfileAtom);

  return (
    <>
      <Stack.Screen.Title />
      <Host style={{ flex: 1 }}>
        <Group>
          {AsyncResult.matchWithError(state, {
            onInitial: () => (
              <ProfileList>
                <Section>
                  <ProgressView
                    modifiers={[
                      containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                    ]}
                  />
                </Section>
              </ProfileList>
            ),
            onError: () => (
              <ProfileList>
                <Section>
                  <Text>Unable to load the user profile</Text>
                </Section>
              </ProfileList>
            ),
            onDefect: () => (
              <ProfileList>
                <Section>
                  <Text>Unable to load the user profile</Text>
                </Section>
              </ProfileList>
            ),
            onSuccess: ({ value }) =>
              Option.match(value, {
                onNone: () => (
                  <ProfileList>
                    <Section>
                      <Text>No active user</Text>
                    </Section>
                  </ProfileList>
                ),
                onSome: (profile) => <LoadedProfile key={profile.id} profile={profile} />,
              }),
          })}
        </Group>
      </Host>
    </>
  );
}
