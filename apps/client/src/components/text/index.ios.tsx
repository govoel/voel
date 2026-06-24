import { Text as SwiftText } from '@expo/ui/swift-ui';
import { createModifier, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';

import type { TextComponent } from '#src/components/text/index.tsx';

export const iosTextStyle = (
  style:
    | 'largeTitle'
    | 'title'
    | 'title2'
    | 'title3'
    | 'headline'
    | 'subheadline'
    | 'body'
    | 'callout'
    | 'footnote'
    | 'caption'
    | 'caption2'
) => createModifier('voelTextStyle', { style });

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
      ...(typeof color === 'string' ? [foregroundStyle(color)] : []),
      ...modifiers,
    ]}>
    {children}
  </SwiftText>
)) satisfies TextComponent;
