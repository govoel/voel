import { Column } from '@expo/ui/jetpack-compose';
import { fillMaxSize, padding } from '@expo/ui/jetpack-compose/modifiers';

import { ScreenHost } from '#src/components/screen-host';
import type { CenteredTabScreenPageComponent } from '#src/components/tab-screen-page/centered';
import { Spacing } from '#src/constants/theme.ts';

export const CenteredTabScreenPage = (({ header, children }) => (
  <ScreenHost>
    {(contentTopInset) => (
      <Column
        modifiers={[
          fillMaxSize(),
          padding(Spacing.three, contentTopInset + Spacing.three, Spacing.three, Spacing.three),
        ]}
        horizontalAlignment="start">
        {header}
        {children}
      </Column>
    )}
  </ScreenHost>
)) satisfies CenteredTabScreenPageComponent;
