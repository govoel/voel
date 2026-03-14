import { setAndroidNavigationBar } from '../android-navigation-bar';
import { createStore } from '@xstate/store';
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';
import { Appearance } from 'react-native';

export type Theme = 'dark' | 'light' | 'system';

export const getSafeColorScheme = (theme: string | null | undefined): 'light' | 'dark' =>
  theme === 'light' || theme === 'dark' ? theme : 'dark';

export const themeStore = createStore({
  context: {
    theme: (SecureStore.getItem('theme') ?? 'system') as Theme,
  },
  on: {
    setTheme: (context, event: { theme: Theme }) => {
      SecureStore.setItem('theme', event.theme);
      if (event.theme === 'system') {
        colorScheme.set('system');
        setAndroidNavigationBar(getSafeColorScheme(Appearance.getColorScheme()));
        return { theme: 'system' as Theme };
      } else {
        colorScheme.set(event.theme);
        setAndroidNavigationBar(event.theme);
        return { theme: event.theme };
      }
    },
  },
});
