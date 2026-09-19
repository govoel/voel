import { LabeledContent } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';

import type { DetailRowsComponent } from '#src/components/detail-rows';
import { Text } from '#src/components/text';

export const DetailRows = (({ details }) => (
  <>
    {details.map(({ label, value }) => (
      <LabeledContent key={label} label={label}>
        <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
          {value}
        </Text>
      </LabeledContent>
    ))}
  </>
)) satisfies DetailRowsComponent;
