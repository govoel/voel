import { Column } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import type { ReactNode } from 'react';
import { SafeScrollView } from '#src/components/safe-scroll-view';
import type { TabScreenPageComponent } from '#src/components/tab-screen-page';
import { Spacing } from '#src/constants/theme.ts';


export const TabScreenPage = (({
  header,
  children,
}: {
  readonly header?: ReactNode;
  readonly children?: ReactNode;
}) => (
  <SafeScrollView>
    <Column
      horizontalAlignment="start"
      verticalArrangement={{ spacedBy: Spacing.two }}
      modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
      {header}
      {children}
    </Column>
  </SafeScrollView>
)) satisfies TabScreenPageComponent;
