import '~/global.css';

import { useReactQueryDevTools } from '@dev-plugins/react-query';
import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import {
  colorScheme as nativewindColorScheme,
  useColorScheme as useNativewindColorScheme,
} from 'nativewind';
import { useLayoutEffect, useRef } from 'react';
import { Appearance, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toaster } from 'sonner-native';

import { setAndroidNavigationBar } from '~/lib/android-navigation-bar';
import { queryClient } from '~/lib/api/query-client';
import { NAV_THEME } from '~/lib/constants';
import { themeStore } from '~/lib/stores/color-scheme';

const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: NAV_THEME.light,
};
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: NAV_THEME.dark,
};

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const hasMounted = useRef(false);

  useReactQueryDevTools(queryClient);

  useLayoutEffect(() => {
    if (hasMounted.current) {
      return;
    }

    if (Platform.OS === 'web') {
      // Adds the background color to the html element to prevent white background on overscroll.
      document.documentElement.classList.add('bg-background');
    }

    setAndroidNavigationBar(nativewindColorScheme.get() ?? 'dark');

    hasMounted.current = true;

    const appearanceChangeListener = Appearance.addChangeListener(({ colorScheme }) => {
      if (themeStore.getSnapshot().context.theme === 'system') {
        setAndroidNavigationBar(colorScheme ?? 'dark');
      }
    });

    return appearanceChangeListener.remove;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView>
        <ThemeAndPortalLayout />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const ThemeAndPortalLayout = () => {
  const { colorScheme: nativeWindColorScheme } = useNativewindColorScheme();

  return (
    <ThemeProvider value={nativeWindColorScheme === 'dark' ? DARK_THEME : LIGHT_THEME}>
      <Stack screenOptions={{ headerShown: false }} />
      <Toaster
        toastOptions={{
          titleStyle: { fontFamily: 'Voel-Inter-SemiBold' },
          descriptionStyle: { fontFamily: 'Voel-Inter-Regular' },
        }}
      />
      <PortalHost />
    </ThemeProvider>
  );
};
