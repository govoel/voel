import { Text as SwiftUIText } from '@expo/ui/swift-ui';
import { Match } from 'effect';

import { iosTextStyle } from '#modules/design-system';
import type { TextComponent } from '#src/components/text.tsx';

export const Text = (({ variant = 'body', children }) => (
  <SwiftUIText
    modifiers={Match.value(variant).pipe(
      Match.when('h1', () => [iosTextStyle('largeTitle')]),
      Match.when('h2', () => [iosTextStyle('title')]),
      Match.when('h3', () => [iosTextStyle('title2')]),
      Match.when('h4', () => [iosTextStyle('title3')]),
      Match.when('h5', () => [iosTextStyle('headline')]),
      Match.when('h6', () => [iosTextStyle('subheadline')]),
      Match.when('body', () => [iosTextStyle('body')]),
      Match.when('caption', () => [iosTextStyle('caption')]),
      Match.exhaustive
    )}>
    {children}
  </SwiftUIText>
)) satisfies TextComponent;

export default Text;
