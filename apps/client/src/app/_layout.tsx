import { RegistryContext, useAtomSuspense } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AccountsAutoPresenter } from '#src/components/accounts-auto-presenter.tsx';
import { accountsSheetAtom } from '#src/services/accounts/atoms.ts';
import { AppRegistry } from '#src/services/registry.ts';

export const SuspenseFallback = () => (
  <Host style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ProgressView />
  </Host>
);

const AppStack = () => {
  const accountsSheet = useAtomSuspense(accountsSheetAtom);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="accounts"
        options={{
          presentation: 'modal',
          gestureEnabled: accountsSheet.value.dismissable,
        }}
      />
    </Stack>
  );
};

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <RegistryContext.Provider value={AppRegistry}>
      <ThemeProvider value={colorScheme === 'light' ? DefaultTheme : DarkTheme}>
        <AppStack />

        <AccountsAutoPresenter />
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
