import { Text as ComposeText } from '@expo/ui/jetpack-compose';
import { Match } from 'effect';

import type { TextComponent } from '#src/components/text/index.tsx';
import { materialFonts } from '#src/constants/material.ts';

export const Text = (({ variant = 'body', modifiers, children, color }) => (
  <ComposeText
    {...(modifiers ? { modifiers } : {})}
    {...(typeof color === 'string' ? { color } : {})}
    style={Match.value(variant).pipe(
      Match.when('h1', () => ({
        ...materialFonts.heavy,
        typography: 'headlineLarge' as const,
      })),
      Match.when('h2', () => ({
        ...materialFonts.heavy,
        typography: 'headlineMedium' as const,
      })),
      Match.when('h3', () => ({
        ...materialFonts.bold,
        typography: 'headlineSmall' as const,
      })),
      Match.when('h4', () => ({
        ...materialFonts.bold,
        typography: 'titleLarge' as const,
      })),
      Match.when('h5', () => ({
        ...materialFonts.medium,
        typography: 'titleMedium' as const,
      })),
      Match.when('h6', () => ({
        ...materialFonts.medium,
        typography: 'titleSmall' as const,
      })),
      Match.when('body', () => ({
        ...materialFonts.regular,
        typography: 'bodyLarge' as const,
      })),
      Match.when('caption', () => ({
        ...materialFonts.regular,
        typography: 'bodySmall' as const,
      })),
      Match.exhaustive
    )}>
    {children}
  </ComposeText>
)) satisfies TextComponent;
