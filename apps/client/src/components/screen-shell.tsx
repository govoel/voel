import { Column, Host, ScrollView, Text } from '@expo/ui';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

import { MaxContentWidth, Spacing } from '#src/constants/theme.ts';
import { useTheme } from '#src/hooks/use-theme.ts';

type ScreenShellProps = PropsWithChildren<{
  readonly title: string;
  readonly eyebrow?: string;
}>;

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    width: '100%',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
  },
});

export const ScreenShell = ({ children, eyebrow, title }: ScreenShellProps) => {
  const theme = useTheme();
  const hasEyebrow = typeof eyebrow === 'string' && eyebrow.length > 0;

  return (
    <Host matchContents>
      <ScrollView>
        <Column>
          {hasEyebrow ? <Text textStyle={{ color: theme.textSecondary }}>{eyebrow}</Text> : null}
          <Text textStyle={{ ...styles.title, color: theme.text }}>{title}</Text>
          {children}
        </Column>
      </ScrollView>
    </Host>
  );
};
