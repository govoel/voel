import { Text as ComposeText, useMaterialColors } from '@expo/ui/jetpack-compose';
import { Match } from 'effect';

import type { TextComponent } from '#src/components/text';

export const Text = (({ variant = 'body', modifiers, children }) => {
  const colors = useMaterialColors();

  return (
    <ComposeText
      color={colors.onBackground}
      {...(modifiers ? { modifiers } : {})}
      style={Match.value(variant).pipe(
        Match.when('h1', () => ({
          fontFamily: 'Google Sans Bold',
          fontWeight: '700' as const,
          typography: 'headlineLarge' as const,
        })),
        Match.when('h2', () => ({
          fontFamily: 'Google Sans Bold',
          fontWeight: '700' as const,
          typography: 'headlineMedium' as const,
        })),
        Match.when('h3', () => ({
          fontFamily: 'Google Sans SemiBold',
          fontWeight: '600' as const,
          typography: 'headlineSmall' as const,
        })),
        Match.when('h4', () => ({
          fontFamily: 'Google Sans SemiBold',
          fontWeight: '600' as const,
          typography: 'titleLarge' as const,
        })),
        Match.when('h5', () => ({
          fontFamily: 'Google Sans Medium',
          fontWeight: '500' as const,
          typography: 'titleMedium' as const,
        })),
        Match.when('h6', () => ({
          fontFamily: 'Google Sans Medium',
          fontWeight: '500' as const,
          typography: 'titleSmall' as const,
        })),
        Match.when('body', () => ({
          fontFamily: 'Google Sans',
          fontWeight: '400' as const,
          typography: 'bodyLarge' as const,
        })),
        Match.when('caption', () => ({
          fontFamily: 'Google Sans',
          fontWeight: '400' as const,
          typography: 'bodySmall' as const,
        })),
        Match.exhaustive
      )}>
      {children}
    </ComposeText>
  );
}) satisfies TextComponent;
