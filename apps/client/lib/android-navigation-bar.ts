import * as NavigationBar from 'expo-navigation-bar';
import * as StatusBar from 'expo-status-bar';
import { Platform } from 'react-native';

import { NAV_THEME } from '~/lib/constants';

export async function setAndroidNavigationBar(theme: 'light' | 'dark') {
  if (Platform.OS !== 'android') return;
  await NavigationBar.setButtonStyleAsync(theme === 'dark' ? 'light' : 'dark');
  await NavigationBar.setBackgroundColorAsync(
    theme === 'dark' ? NAV_THEME.dark.background : NAV_THEME.light.background
  );
  StatusBar.setStatusBarStyle(theme === 'dark' ? 'light' : 'dark');
  StatusBar.setStatusBarBackgroundColor(
    theme === 'dark' ? NAV_THEME.dark.background : NAV_THEME.light.background
  );
}
