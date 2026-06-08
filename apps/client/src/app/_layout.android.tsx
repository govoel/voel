import { RegistryContext } from '@effect/atom-react';
import { Host, LoadingIndicator, getMaterialColors } from '@expo/ui/jetpack-compose';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import type { Theme } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AppRegistry } from '#src/services/registry.ts';

export const SuspenseFallback = () => (
  <Host seedColor="#00AAFF" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <LoadingIndicator />
  </Host>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = getMaterialColors({
    scheme: colorScheme === 'light' ? 'light' : 'dark',
    seedColor: '#00AAFF',
  });

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
    fonts: {
      ...baseTheme.fonts,
      regular: { fontFamily: 'Google Sans', fontWeight: '400' },
      medium: { fontFamily: 'Google Sans Medium', fontWeight: '500' },
      bold: { fontFamily: 'Google Sans SemiBold', fontWeight: '600' },
      heavy: { fontFamily: 'Google Sans Bold', fontWeight: '700' },
    },
  } satisfies Theme;

  return (
    <RegistryContext.Provider value={AppRegistry}>
      <ThemeProvider value={theme}>
        <StatusBar style={colorScheme === 'light' ? 'dark' : 'light'} />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="accounts"
            options={{
              presentation: 'transparentModal',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </Stack>
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
