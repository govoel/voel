import { VStack } from '@expo/ui/swift-ui';

import type { TabScreenColumnComponent } from '#src/components/tab-screen-column';

export const TabScreenColumn = (({ children }) => (
  <VStack alignment="leading" spacing={12}>
    {children}
  </VStack>
)) satisfies TabScreenColumnComponent;
