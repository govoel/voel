import { VStack } from '@expo/ui/swift-ui';
import { padding } from '@expo/ui/swift-ui/modifiers';
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
    <VStack
      alignment="leading"
      spacing={Spacing.two}
      modifiers={[padding({ horizontal: Spacing.three })]}>
      {header}
      {children}
    </VStack>
  </SafeScrollView>
)) satisfies TabScreenPageComponent;
