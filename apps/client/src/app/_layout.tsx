import { RegistryProvider } from '@effect/atom-react';
import { ProgressView } from '@expo/ui/swift-ui';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { View, useColorScheme } from 'react-native';

export const SuspenseFallback = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ProgressView />
  </View>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <RegistryProvider>
      <ThemeProvider value={colorScheme === 'light' ? DefaultTheme : DarkTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </RegistryProvider>
  );
}
