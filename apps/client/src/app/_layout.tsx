import { RegistryContext, useAtomSuspense } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AccountsAutoPresenter } from '#src/components/accounts-auto-presenter/index.tsx';
import { accountsSheetAtom } from '#src/components/accounts-auto-presenter/model.ts';
import { AppAtomDevTools } from '#src/components/atom-devtools/index.ios.tsx';
import { AppRegistry } from '#src/services/registry.ts';

export const SuspenseFallback = () => (
  <Host style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ProgressView />
  </Host>
);

const FocusedScreenLayout = ({ children }: { readonly children: ReactNode }) => {
  const isFocused = useIsFocused();

  return (
    <View style={styles.screen}>
      {children}
      {isFocused ? <AppAtomDevTools /> : null}
    </View>
  );
};

const rootScreenLayout = ({ children }: { readonly children: ReactNode }) => (
  <FocusedScreenLayout>{children}</FocusedScreenLayout>
);

const AppStack = () => {
  const accountsSheet = useAtomSuspense(accountsSheetAtom);

  return (
    <Stack screenLayout={rootScreenLayout} screenOptions={{ headerShown: false }}>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
