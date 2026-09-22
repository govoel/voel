import { Text as SwiftText } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import type { ComponentProps } from 'react';

import type { TextComponent } from '#src/components/text/index.tsx';

const textStyles = {
  h1: { textStyle: 'largeTitle', weight: 'bold' },
  h2: { textStyle: 'title', weight: 'bold' },
  h3: { textStyle: 'title2', weight: 'semibold' },
  h4: { textStyle: 'title3', weight: 'semibold' },
  h5: { textStyle: 'headline', weight: 'medium' },
  h6: { textStyle: 'subheadline', weight: 'medium' },
  body: { textStyle: 'body', weight: 'regular' },
  caption: { textStyle: 'caption', weight: 'regular' },
} satisfies Record<
  NonNullable<ComponentProps<TextComponent>['variant']>,
  Parameters<typeof font>[0]
>;

export const Text = (({ variant = 'body', color, modifiers = [], children }) => (
  <SwiftText
    modifiers={[
      font(textStyles[variant]),
      ...(typeof color === 'string' ? [foregroundStyle(color)] : []),
      ...modifiers,
    ]}>
    {children}
  </SwiftText>
)) satisfies TextComponent;
