import { Column } from '@expo/ui/jetpack-compose';

import type { TabScreenColumnComponent } from '#src/components/tab-screen-column/index.tsx';

export const TabScreenColumn = (({ children }) => (
  <Column horizontalAlignment="start" verticalArrangement={{ spacedBy: 12 }}>
    {children}
  </Column>
)) satisfies TabScreenColumnComponent;
