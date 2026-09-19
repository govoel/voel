import type { DetailRowsComponent } from '#src/components/detail-rows';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';

export const DetailRows = (({ details }) => (
  <SegmentedList>
    {details.map(({ label, value }, index) => (
      <SegmentedListItem key={label} index={index} count={details.length}>
        <SegmentedListItem.HeadlineContent>
          <Text variant="caption">{label}</Text>
        </SegmentedListItem.HeadlineContent>
        <SegmentedListItem.SupportingContent>
          <Text>{value}</Text>
        </SegmentedListItem.SupportingContent>
      </SegmentedListItem>
    ))}
  </SegmentedList>
)) satisfies DetailRowsComponent;
