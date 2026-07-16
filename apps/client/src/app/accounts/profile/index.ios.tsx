import { useAtomValue } from '@effect/atom-react';
import {
  BottomSheet,
  Button,
  Group,
  Host,
  LabeledContent,
  List,
  ProgressView,
  Section,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  foregroundStyle,
  frame,
  headerProminence,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import { updateActiveUserProfile } from '#src/app/accounts/profile/index.tsx';
import { Text } from '#src/components/text';
import { UserProfileEditor } from '#src/components/user-profile-editor/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';
import { activeAccountSessionAtom } from '#src/services/accounts/atoms.ts';
import { AccountRole } from '#src/services/database/main/schema';

const ProfileList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased')]}>{children}</List>
);

const LoadedProfile = ({
  email,
  name,
  role,
  username,
}: {
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly username: string;
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  return (
    <>
      <ZStack alignment="bottom">
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
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
        </List>

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

      <BottomSheet
        isPresented={isEditingProfile}
        onIsPresentedChange={(isPresented) => {
          setIsEditingProfile(isPresented);
        }}>
        {/* Unmount the editor when dismissed so each presentation starts with fresh form state. */}
        {isEditingProfile ? (
          <UserProfileEditor
            profile={{ name, username }}
            updateProfile={updateActiveUserProfile}
            onProfileUpdated={() => {
              setIsEditingProfile(false);
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
};

export default function ProfileScreen() {
  const activeAccountSession = useAtomValue(activeAccountSessionAtom);

  return (
    <>
      <Stack.Screen.Title />
      <Host style={{ flex: 1 }}>
        <Group>
          {AsyncResult.matchWithError(activeAccountSession, {
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
            onSuccess: ({ value }) =>
              Option.match(value, {
                onNone: () => (
                  <ProfileList>
                    <Section>
                      <Text>No active user</Text>
                    </Section>
                  </ProfileList>
                ),
                onSome: (session) => {
                  if (session.data === null) {
                    return (
                      <ProfileList>
                        <Section>
                          {session.isPending ? (
                            <ProgressView
                              modifiers={[
                                containerRelativeFrame({
                                  axes: 'horizontal',
                                  alignment: 'center',
                                }),
                              ]}
                            />
                          ) : (
                            <Text>Unable to load the user profile</Text>
                          )}
                        </Section>
                      </ProfileList>
                    );
                  }

                  const { user } = session.data;

                  return (
                    <LoadedProfile
                      key={user.id}
                      email={user.email}
                      name={user.name}
                      role={AccountRole.formatFromNullishString(user.role)}
                      username={user.username ?? ''}
                    />
                  );
                },
              }),
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
          })}
        </Group>
      </Host>
    </>
  );
}
