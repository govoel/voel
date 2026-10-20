import { RegistryContext } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AccountsAutoPresenter } from '#src/domains/accounts/components/auto-presenter/index.tsx';
import { AppRegistry } from '#src/runtime/registry.ts';

export const unstable_settings = {
  anchor: '(tabs)',
};

export const SuspenseFallback = () => (
  <Host style={{ flex: 1 }}>
    <ProgressView
      modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' })]}
    />
  </Host>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <RegistryContext.Provider value={AppRegistry}>
      <ThemeProvider value={colorScheme === 'light' ? DefaultTheme : DarkTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="accounts" options={{ presentation: 'modal' }} />
          <Stack.Screen name="(account-entry)" options={{ presentation: 'modal' }} />
        </Stack>

        <AccountsAutoPresenter />
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
