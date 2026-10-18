import { Host } from '@expo/ui/swift-ui';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScreenHostComponent } from '#src/components/screen-host';
import { StatusBarGradient } from '#src/components/screen-host/status-bar-gradient.tsx';

export const ScreenHost = (({ children }) => {
  const { top } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'light' ? '#ffffff' : '#000000';

  return (
    <>
      <StatusBarGradient
        backgroundColor={backgroundColor}
        height={top}
        visible={headerHeight === 0}
      />

      <Host style={{ flex: 1 }}>{children(0)}</Host>
    </>
  );
}) satisfies ScreenHostComponent;
