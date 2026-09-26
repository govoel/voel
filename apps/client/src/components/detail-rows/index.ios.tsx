import { LabeledContent, List } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';

import type { DetailRowsComponent } from '#src/components/detail-rows';
import { Text } from '#src/components/text';

export const DetailRows = (({ details }) => (
  <List.ForEach data={details} keyExtractor={({ label }) => label} recycling={false}>
    {({ item: { label, value } }) => (
      <LabeledContent label={label}>
        <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
          {value}
        </Text>
      </LabeledContent>
    )}
  </List.ForEach>
)) satisfies DetailRowsComponent;
