import { Host, LazyColumn, Surface, getMaterialColors } from '@expo/ui/jetpack-compose';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SafeScrollViewComponent } from '#src/components/safe-scroll-view';
import { StatusBarGradient } from '#src/components/safe-scroll-view/status-bar-gradient.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const SafeScrollView = (({ children }) => {
  const { top } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const paddingTop = headerHeight > 0 ? 0 : top;

  const colorScheme = useColorScheme();
  const { background } = getMaterialColors({
    scheme: colorScheme === 'light' ? 'light' : 'dark',
    seedColor: '#00AAFF',
  });

  return (
    <>
      <StatusBarGradient backgroundColor={background} />

      <Host seedColor="#00AAFF" style={{ flex: 1 }}>
        <Surface>
          <LazyColumn
            horizontalAlignment="start"
            contentPadding={{ top: paddingTop + Spacing.three, bottom: Spacing.three }}>
            {children}
          </LazyColumn>
        </Surface>
      </Host>
    </>
  );
}) satisfies SafeScrollViewComponent;
