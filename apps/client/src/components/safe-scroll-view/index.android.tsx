import { Host, getMaterialColors } from '@expo/ui/jetpack-compose';
import { ScrollView, useColorScheme } from 'react-native';
import type { ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';

import { StatusBarGradient } from '#src/components/safe-scroll-view/base.tsx';

export const SafeScrollView = ({ children, ...props }: ScrollViewProps) => {
  const { top } = useSafeAreaInsets();

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
          contentContainerStyle={{ paddingTop: top, ...props.contentContainerStyle }}
          {...props}>
          <Host matchContents>{children}</Host>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};
