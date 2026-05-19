import { Text as ComposeText, useMaterialColors } from '@expo/ui/jetpack-compose';
import { Match } from 'effect';

import type { TextComponent } from '#src/components/text.tsx';

export const Text = (({ variant = 'body', children }) => {
  const colors = useMaterialColors();

  return (
    <ComposeText
      color={colors.onBackground}
      style={{
        typography: Match.value(variant).pipe(
          Match.when('h1', () => 'displayLarge' as const),
          Match.when('h2', () => 'displayMedium' as const),
          Match.when('h3', () => 'displaySmall' as const),
          Match.when('h4', () => 'headlineLarge' as const),
          Match.when('h5', () => 'headlineMedium' as const),
          Match.when('h6', () => 'headlineSmall' as const),
          Match.when('body', () => 'bodyLarge' as const),
          Match.when('caption', () => 'bodySmall' as const),
          Match.exhaustive
        ),
      }}>
      {children}
    </ComposeText>
  );
}) satisfies TextComponent;

export default Text;
