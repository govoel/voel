import { useAtomValue } from '@effect/atom-react';
import {
  Button,
  Column,
  LazyColumn,
  LoadingIndicator,
  ModalBottomSheet,
} from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { activeUserProfileAtom, useUserProfileForm } from '#src/app/accounts/profile/index.ts';
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
