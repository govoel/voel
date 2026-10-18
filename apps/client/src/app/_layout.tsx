import { RegistryContext } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AppAdmission } from '#src/components/app-admission/index.tsx';
import { AppRegistry } from '#src/runtime/registry.ts';

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
        <AppAdmission loading={<SuspenseFallback />} />
      </ThemeProvider>
    </RegistryContext.Provider>
  );
}
