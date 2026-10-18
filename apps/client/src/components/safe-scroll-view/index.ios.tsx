import { LazyVStack, ScrollView } from '@expo/ui/swift-ui';
import { padding } from '@expo/ui/swift-ui/modifiers';

import type { SafeScrollViewComponent } from '#src/components/safe-scroll-view';
import { ScreenHost } from '#src/components/screen-host';
import { Spacing } from '#src/constants/theme.ts';

export const SafeScrollView = (({ children }) => (
  <ScreenHost>
    {() => (
      <ScrollView>
        <LazyVStack
          alignment="leading"
          modifiers={[padding({ top: Spacing.three, bottom: Spacing.three })]}>
          {children}
        </LazyVStack>
      </ScrollView>
    )}
  </ScreenHost>
)) satisfies SafeScrollViewComponent;
