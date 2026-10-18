import { LazyColumn } from '@expo/ui/jetpack-compose';

import type { SafeScrollViewComponent } from '#src/components/safe-scroll-view';
import { ScreenHost } from '#src/components/screen-host';
import { Spacing } from '#src/constants/theme.ts';

export const SafeScrollView = (({ children }) => (
  <ScreenHost>
    {(contentTopInset) => (
      <LazyColumn
        horizontalAlignment="start"
        contentPadding={{ top: contentTopInset + Spacing.three, bottom: Spacing.three }}>
        {children}
      </LazyColumn>
    )}
  </ScreenHost>
)) satisfies SafeScrollViewComponent;
