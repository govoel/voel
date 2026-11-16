import { LazyColumn } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { useRouter } from 'expo-router';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import type { InvalidLinkScreenComponent } from '#src/components/invalid-link-screen';
import { goBackOrHome } from '#src/components/invalid-link-screen/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const InvalidLinkScreen = (() => {
  const router = useRouter();
  return (
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
              goBackOrHome({ router });
            }}>
            <SegmentedListItem.HeadlineContent>
              <Text>Back</Text>
            </SegmentedListItem.HeadlineContent>
          </SegmentedListItem>
        </SegmentedList>
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}) satisfies InvalidLinkScreenComponent;
