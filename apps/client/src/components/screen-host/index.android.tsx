import { Host, Surface } from '@expo/ui/jetpack-compose';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScreenHostComponent } from '#src/components/screen-host';
import { StatusBarGradient } from '#src/components/screen-host/status-bar-gradient.tsx';
import { materialSeedColor, useMaterialColors } from '#src/constants/material.ts';

export const ScreenHost = (({ children }) => {
  const { top } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { background } = useMaterialColors();

  return (
    <>
      <StatusBarGradient backgroundColor={background} height={top} visible={headerHeight === 0} />

      <Host seedColor={materialSeedColor} style={{ flex: 1 }}>
        <Surface>{children(headerHeight > 0 ? 0 : top)}</Surface>
      </Host>
    </>
  );
}) satisfies ScreenHostComponent;
