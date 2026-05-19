import { RegistryProvider } from '@effect/atom-react';
import { getMaterialColors } from '@expo/ui/jetpack-compose';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
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
  };

  return (
    <RegistryProvider>
      <ThemeProvider value={theme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </RegistryProvider>
  );
}
