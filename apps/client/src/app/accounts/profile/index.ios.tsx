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
import type { Atom } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import { Text } from '#src/components/text';
import { UserProfileEditor } from '#src/components/user-profile-editor/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';
import { activeUserProfileAtom } from '#src/services/accounts/atoms.ts';
import type { ActiveUserProfile } from '#src/services/accounts/atoms.ts';

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

const renderProfileState = (state: Atom.Type<typeof activeUserProfileAtom>) =>
  AsyncResult.matchWithError(state, {
    onInitial: () => (
      <ProfileList>
        <Section>
          <ProgressView
            modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
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
        onSome: (profile) => (
          <LoadedProfile
            key={profile.id}
            email={profile.email}
            name={profile.name}
            role={profile.role}
            username={profile.username}
          />
        ),
      }),
  });

export default function ProfileScreen() {
  const profileState = useAtomValue(activeUserProfileAtom);

  return (
    <>
      <Stack.Screen.Title />
      <Host style={{ flex: 1 }}>
        <Group>{renderProfileState(profileState)}</Group>
      </Host>
    </>
  );
}
