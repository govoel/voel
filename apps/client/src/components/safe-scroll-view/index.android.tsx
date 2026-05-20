import { Host, getMaterialColors } from '@expo/ui/jetpack-compose';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { ScrollView, useColorScheme } from 'react-native';
import type { ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';

import { StatusBarGradient } from '#src/components/safe-scroll-view/base.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const SafeScrollView = ({ children, ...props }: ScrollViewProps) => {
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

      <SafeAreaView edges={{ bottom: true }} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: paddingTop + Spacing.three,
            paddingBottom: Spacing.three,
            paddingLeft: Spacing.three,
            paddingRight: Spacing.three,
            ...props.contentContainerStyle,
          }}
          {...props}>
          <Host matchContents={{ vertical: true }}>{children}</Host>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};
