import { RegistryContext } from '@effect/atom-react';
import { Host, LoadingIndicator, Surface } from '@expo/ui/jetpack-compose';
import { graphicsLayer } from '@expo/ui/jetpack-compose/modifiers';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import type { Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AppAdmission } from '#src/components/app-admission/index.tsx';
import { materialFonts, materialSeedColor, useMaterialColors } from '#src/constants/material.ts';
import { AppRegistry } from '#src/runtime/registry.ts';

const loadingIndicatorScale = 0.25;

export const SuspenseFallback = () => (
  <Host
    seedColor={materialSeedColor}
    style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Surface>
      <LoadingIndicator
        modifiers={[
          graphicsLayer({ scaleX: loadingIndicatorScale, scaleY: loadingIndicatorScale }),
        ]}
      />
    </Surface>
  </Host>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = useMaterialColors();

  const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  const theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.onSurface,
      border: colors.outlineVariant,
      notification: colors.error,
    },
    fonts: materialFonts,
  } satisfies Theme;

  return (
    <RegistryContext.Provider value={AppRegistry}>
      <ThemeProvider value={theme}>
        <AppAdmission loading={<SuspenseFallback />} />
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
