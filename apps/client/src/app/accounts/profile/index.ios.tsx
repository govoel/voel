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
import { Match } from 'effect';
import { Stack } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import { activeUserProfileAtom } from '#src/app/accounts/profile/index.tsx';
import type {
  ActiveUserProfile,
  ActiveUserProfileState,
} from '#src/app/accounts/profile/index.tsx';
import { Text } from '#src/components/text';
import { UserProfileEditor } from '#src/components/user-profile-editor/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

const ProfileList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased')]}>{children}</List>
);

const LoadedProfile = ({
  email,
  name,
  role,
  username,
}: Pick<ActiveUserProfile, 'email' | 'name' | 'role' | 'username'>) => {
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
            onProfileUpdated={() => {
              setIsEditingProfile(false);
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
};

const renderProfileState = Match.type<ActiveUserProfileState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <ProfileList>
        <Section>
          <ProgressView
            modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
          />
        </Section>
      </ProfileList>
    ),
    NoActiveUser: () => (
      <ProfileList>
        <Section>
          <Text>No active user</Text>
        </Section>
      </ProfileList>
    ),
    LoadError: () => (
      <ProfileList>
        <Section>
          <Text>Unable to load the user profile</Text>
        </Section>
      </ProfileList>
    ),
    Loaded: ({ profile }) => (
      <LoadedProfile
        key={profile.id}
        email={profile.email}
        name={profile.name}
        role={profile.role}
        username={profile.username}
      />
    ),
  })
);

const ProfileState = ({ state }: { readonly state: ActiveUserProfileState }) =>
  renderProfileState(state);

export default function ProfileScreen() {
  const profileState = useAtomValue(activeUserProfileAtom);

  return (
    <>
      <Stack.Screen.Title />
      <Host style={{ flex: 1 }}>
        <Group>
          <ProfileState state={profileState} />
        </Group>
      </Host>
    </>
  );
}
