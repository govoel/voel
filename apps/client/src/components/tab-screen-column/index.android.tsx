import { Column } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';

import type { TabScreenColumnComponent } from '#src/components/tab-screen-column';
import { Spacing } from '#src/constants/theme.ts';

export const TabScreenColumn = (({ children }) => (
  <Column
    horizontalAlignment="start"
    verticalArrangement={{ spacedBy: 12 }}
    modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
    {children}
  </Column>
)) satisfies TabScreenColumnComponent;
