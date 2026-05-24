import { Text as SwiftText } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';

import { iosTextStyle } from '#modules/design-system';
import type { TextComponent } from '#src/components/text';

export const Text = (({ variant = 'body', color, modifiers = [], children }) => (
  <SwiftText
    modifiers={[
      ...Match.value(variant).pipe(
        Match.when('h1', () => [iosTextStyle('largeTitle')]),
        Match.when('h2', () => [iosTextStyle('title')]),
        Match.when('h3', () => [iosTextStyle('title2')]),
        Match.when('h4', () => [iosTextStyle('title3')]),
        Match.when('h5', () => [iosTextStyle('headline')]),
        Match.when('h6', () => [iosTextStyle('subheadline')]),
        Match.when('body', () => [iosTextStyle('body')]),
        Match.when('caption', () => [iosTextStyle('caption')]),
        Match.exhaustive
      ),
      ...(color == null ? [] : [foregroundStyle(color)]),
      ...modifiers,
    ]}>
    {children}
  </SwiftText>
)) satisfies TextComponent;
