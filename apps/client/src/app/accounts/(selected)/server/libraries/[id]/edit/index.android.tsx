import { LazyColumn } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { Option, Result } from 'effect';
import { Redirect, Stack, useNavigation, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { LibraryEditor } from '#src/domains/library/editor';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const navigation = useNavigation();
  const [savedId, setSavedId] = useState<Option.Option<typeof Library.fields.id.Type>>(
    Option.none()
  );
  if (Option.isSome(savedId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/libraries/[id]', params: { id: savedId.value } }}
      />
    );
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <LibraryEditor
        id={Option.some(id)}
        onSuccess={async ({ id: libraryId }) => {
          const sheet = sheetRef.current;
          if (sheet === null || !navigation.isFocused()) {
            return;
          }
          await sheet.hide();
          if (navigation.isFocused()) {
            setSavedId(Option.some(libraryId));
          }
        }}
      />
    </AndroidAccountsSheet>
  );
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  const router = useRouter();
  return Result.match(params, {
    onFailure: () => (
      <>
        <Stack.Screen.Title>Invalid Link</Stack.Screen.Title>
        <AndroidAccountsSheet>
          <LazyColumn
            contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
            <Text variant="h4" modifiers={[padding(0, 0, 0, Spacing.two)]}>
              Invalid Link
            </Text>
            <SegmentedList>
              <SegmentedListItem index={0} count={2} enabled={false}>
                <SegmentedListItem.HeadlineContent>
                  <Text>This link is invalid.</Text>
                </SegmentedListItem.HeadlineContent>
              </SegmentedListItem>
              <SegmentedListItem
                index={1}
                count={2}
                onClick={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/');
                  }
                }}>
                <SegmentedListItem.HeadlineContent>
                  <Text>Back</Text>
                </SegmentedListItem.HeadlineContent>
              </SegmentedListItem>
            </SegmentedList>
          </LazyColumn>
        </AndroidAccountsSheet>
      </>
    ),
    onSuccess: ({ id }) => (
      <>
        <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
        <EditLibrary key={id} id={id} />
      </>
    ),
  });
}
