import { VStack } from '@expo/ui/swift-ui';
import { frame, padding } from '@expo/ui/swift-ui/modifiers';

import { ScreenHost } from '#src/components/screen-host';
import type { CenteredTabScreenPageComponent } from '#src/components/tab-screen-page/centered';
import { Spacing } from '#src/constants/theme.ts';

export const CenteredTabScreenPage = (({ header, children }) => (
  <ScreenHost>
    {() => (
      <VStack
        alignment="leading"
        spacing={Spacing.three}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          padding({ horizontal: Spacing.three, vertical: Spacing.three }),
        ]}>
        {header}
        {children}
      </VStack>
    )}
  </ScreenHost>
)) satisfies CenteredTabScreenPageComponent;
