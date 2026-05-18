import { RegistryProvider } from '@effect/atom-react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { StatusBarBackground } from '#src/components/status-bar-background.tsx';

export const SuspenseFallback = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" />
  </View>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <RegistryProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBarBackground />
      </ThemeProvider>
    </RegistryProvider>
  );
}
