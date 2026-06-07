import { RegistryContext, useAtomSuspense } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import AccountsAutoPresenter from '#src/components/accounts-auto-presenter.tsx';
import { accountsSheetAtom } from '#src/services/accounts/atoms.ts';
import { AppRegistry } from '#src/services/registry.ts';

export const SuspenseFallback = () => (
  <Host style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ProgressView />
  </Host>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const sheet = useAtomSuspense(accountsSheetAtom);

  return (
    <RegistryContext.Provider value={AppRegistry}>
      <ThemeProvider value={colorScheme === 'light' ? DefaultTheme : DarkTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={sheet.value.dismissable}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>

          <Stack.Screen
            name="accounts"
            options={{
              animation: 'none',
              presentation: 'containedTransparentModal',
            }}
          />
        </Stack>

        <AccountsAutoPresenter />
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
