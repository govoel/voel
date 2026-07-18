import { Host, Surface, getMaterialColors } from '@expo/ui/jetpack-compose';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScreenHostComponent } from '#src/components/screen-host';
import { StatusBarGradient } from '#src/components/screen-host/status-bar-gradient.tsx';

export const ScreenHost = (({ children }) => {
  const { top } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const { background } = getMaterialColors({
    scheme: colorScheme === 'light' ? 'light' : 'dark',
    seedColor: '#00AAFF',
  });

  return (
    <>
      <StatusBarGradient backgroundColor={background} height={top} visible={headerHeight === 0} />

      <Host seedColor="#00AAFF" style={{ flex: 1 }}>
        <Surface>{children(headerHeight > 0 ? 0 : top)}</Surface>
      </Host>
    </>
  );
}) satisfies ScreenHostComponent;
