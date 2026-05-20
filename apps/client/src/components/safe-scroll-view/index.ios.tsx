import { Host } from '@expo/ui/swift-ui';
import { ScrollView, useColorScheme } from 'react-native';
import type { ScrollViewProps } from 'react-native';

import { StatusBarGradient } from '#src/components/safe-scroll-view/base.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const SafeScrollView = ({ children, ...props }: ScrollViewProps) => {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'light' ? '#ffffff' : '#000000';

  return (
    <>
      <StatusBarGradient backgroundColor={backgroundColor} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, ...props.style }}
        contentContainerStyle={{ padding: Spacing.three, ...props.contentContainerStyle }}
        {...props}>
        <Host matchContents={{ vertical: true }}>{children}</Host>
      </ScrollView>
    </>
  );
};
