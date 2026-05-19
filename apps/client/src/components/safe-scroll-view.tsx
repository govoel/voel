import { Host } from '@expo/ui';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useColorScheme, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '#src/constants/theme.ts';

export const SafeScrollView = ({ children }: { children: ReactNode }) => {
  const colorScheme = useColorScheme();
  const { top } = useSafeAreaInsets();
  const scrollViewProps = Platform.select({
    ios: { contentInsetAdjustmentBehavior: 'automatic' as const },
    android: {
      style: { paddingTop: top },
      contentContainerStyle: { paddingBottom: BottomTabInset },
    },
  });

  if (top === 0) {
    return (
      <Host matchContents>
        <ScrollView {...scrollViewProps}>{children}</ScrollView>
      </Host>
    );
  }

  const gradientColor = colorScheme === 'dark' ? '0, 0, 0' : '255, 255, 255';

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(${gradientColor}, 0.72)`, `rgba(${gradientColor}, 0)`]}
        locations={[0, 1]}
        style={{ height: top, position: 'absolute', top: 0, right: 0, left: 0, zIndex: 1000 }}
      />

      <ScrollView {...scrollViewProps}>
        <Host matchContents>{children}</Host>
      </ScrollView>
    </>
  );
};
