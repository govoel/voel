import { LazyColumn } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';

import type { DetailRowsComponent } from '#src/components/detail-rows';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const DetailRows = (({ details }) => (
  <LazyColumn.Items data={details} keyExtractor={({ label }) => label}>
    {({ item: { label, value }, index }) => (
      <SegmentedListItem
        index={index}
        count={details.length}
        modifiers={[padding(0, 0, 0, index < details.length - 1 ? Spacing.half : 0)]}>
        <SegmentedListItem.HeadlineContent>
          <Text variant="caption">{label}</Text>
        </SegmentedListItem.HeadlineContent>
        <SegmentedListItem.SupportingContent>
          <Text>{value}</Text>
        </SegmentedListItem.SupportingContent>
      </SegmentedListItem>
    )}
  </LazyColumn.Items>
)) satisfies DetailRowsComponent;
