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
import { AsyncResult } from 'effect/unstable/reactivity';
import { useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { updateActiveUserProfile } from '#src/app/accounts/profile/index.tsx';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { UserProfileEditor } from '#src/components/user-profile-editor/index.android.tsx';
import { Spacing } from '#src/constants/theme.ts';
import { activeAccountSessionAtom } from '#src/services/accounts/atoms.ts';
import { AccountRole } from '#src/services/database/main/schema';

const ProfileList = ({ children }: PropsWithChildren) => (
  <LazyColumn
    verticalArrangement={{ spacedBy: Spacing.two }}
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
    {children}
  </LazyColumn>
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
  const editProfileSheetRef = useRef<ModalBottomSheetRef>(null);

  const dismissEditProfileSheet = async () => {
    await editProfileSheetRef.current?.hide();
    setIsEditingProfile(false);
  };

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
              updateProfile={updateActiveUserProfile}
              onProfileUpdated={() => {
                void dismissEditProfileSheet();
              }}
            />
          </Column>
        </ModalBottomSheet>
      ) : null}
    </>
  );
};

export default function ProfileScreen() {
  const activeAccountSession = useAtomValue(activeAccountSessionAtom);

  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(activeAccountSession, {
        onInitial: () => (
          <ProfileList>
            <LoadingIndicator modifiers={[fillMaxWidth()]} />
          </ProfileList>
        ),
        onSuccess: ({ value }) =>
          Option.match(value, {
            onNone: () => (
              <ProfileList>
                <Text>No active user</Text>
              </ProfileList>
            ),
            onSome: (session) => {
              if (session.data === null) {
                return (
                  <ProfileList>
                    {session.isPending ? (
                      <LoadingIndicator modifiers={[fillMaxWidth()]} />
                    ) : (
                      <Text>Unable to load the user profile</Text>
                    )}
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
    </AndroidAccountsSheet>
  );
}
