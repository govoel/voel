import { Column, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
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
  <LazyColumn
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
    verticalArrangement={{ spacedBy: Spacing.two }}>
    <Text variant="h3">{title}</Text>
    {children}
    <Column modifiers={[fillMaxWidth(), padding(0, Spacing.two, 0, 0)]}>{footer}</Column>
  </LazyColumn>
);
