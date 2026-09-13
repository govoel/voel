import { List, Section, VStack, ZStack } from '@expo/ui/swift-ui';
import { frame, headerProminence, padding } from '@expo/ui/swift-ui/modifiers';
import type { PropsWithChildren, ReactNode } from 'react';

import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const FormLayout = ({
  title,
  children,
  footer,
}: PropsWithChildren<{
  title: string;
  footer: ReactNode;
}>) => (
  <ZStack alignment="bottom">
    <List
      modifiers={[
        headerProminence('increased'),
        frame({ maxHeight: Infinity }),
        padding({ bottom: 80 }),
      ]}>
      <Section
        header={
          <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
            {title}
          </Text>
        }>
        {children}
      </Section>
    </List>
    <VStack modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
      {footer}
    </VStack>
  </ZStack>
);
