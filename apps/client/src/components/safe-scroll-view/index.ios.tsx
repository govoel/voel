import { Host, LazyVStack, ScrollView } from '@expo/ui/swift-ui';
import { padding } from '@expo/ui/swift-ui/modifiers';
import { useColorScheme } from 'react-native';

import type { SafeScrollViewComponent } from '#src/components/safe-scroll-view/index.tsx';
import { StatusBarGradient } from '#src/components/safe-scroll-view/status-bar-gradient.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const SafeScrollView = (({ children }) => {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'light' ? '#ffffff' : '#000000';

  return (
    <>
      <StatusBarGradient backgroundColor={backgroundColor} />

      <Host style={{ flex: 1 }}>
        <ScrollView>
          <LazyVStack
            alignment="leading"
            modifiers={[padding({ top: Spacing.three, bottom: Spacing.three })]}>
            {children}
          </LazyVStack>
        </ScrollView>
      </Host>
    </>
  );
}) satisfies SafeScrollViewComponent;
