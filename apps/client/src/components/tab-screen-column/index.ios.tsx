import { VStack } from '@expo/ui/swift-ui';
import { padding } from '@expo/ui/swift-ui/modifiers';

import type { TabScreenColumnComponent } from '#src/components/tab-screen-column';
import { Spacing } from '#src/constants/theme.ts';

export const TabScreenColumn = (({ children }) => (
  <VStack alignment="leading" spacing={12} modifiers={[padding({ horizontal: Spacing.three })]}>
    {children}
  </VStack>
)) satisfies TabScreenColumnComponent;
