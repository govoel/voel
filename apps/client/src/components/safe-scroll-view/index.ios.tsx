import { Host } from '@expo/ui/swift-ui';
import { ScrollView, useColorScheme } from 'react-native';
import type { ScrollViewProps } from 'react-native';

import { StatusBarGradient } from '#src/components/safe-scroll-view/base.tsx';

export const SafeScrollView = ({ children, ...props }: ScrollViewProps) => {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'light' ? '#ffffff' : '#000000';

  return (
    <>
      <StatusBarGradient backgroundColor={backgroundColor} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, ...props.style }}
        {...props}>
        <Host matchContents>{children}</Host>
      </ScrollView>
    </>
  );
};
