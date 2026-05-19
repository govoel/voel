import { RegistryProvider } from '@effect/atom-react';
import { getMaterialColors } from '@expo/ui/jetpack-compose';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import type { Theme } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

export const SuspenseFallback = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" />
  </View>
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
    <RegistryProvider>
      <ThemeProvider value={theme}>
        <StatusBar style={colorScheme === 'light' ? 'dark' : 'light'} />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </RegistryProvider>
  );
}
