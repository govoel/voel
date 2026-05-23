import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { ProgressView } from '@expo/ui/swift-ui';
import { AsyncResult } from 'effect/unstable/reactivity';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { View, useColorScheme } from 'react-native';

import { accountsSheetAtom } from '#src/services/accounts/atoms.ts';
import { AppRegistry } from '#src/services/registry.ts';

export const SuspenseFallback = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ProgressView />
  </View>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const sheet = useAtomValue(accountsSheetAtom);

  return (
    <RegistryContext.Provider value={AppRegistry}>
      <ThemeProvider value={colorScheme === 'light' ? DefaultTheme : DarkTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={AsyncResult.isSuccess(sheet) && sheet.value.dismissable}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>

          <Stack.Screen name="accounts" />
        </Stack>
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
