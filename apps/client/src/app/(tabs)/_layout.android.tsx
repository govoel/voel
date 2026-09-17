import { Stack } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { materialFonts, useMaterialColors } from '#src/constants/material.ts';

export const unstable_settings = {
  initialRouteName: '(home)',
};

export default function TabsLayoutAndroid() {
  const colors = useMaterialColors();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <NativeTabs
        labelVisibilityMode="labeled"
        backgroundColor={colors.surfaceContainer}
        tintColor={colors.onSecondaryContainer}
        iconColor={{ default: colors.onSurfaceVariant, selected: colors.onSecondaryContainer }}
        labelStyle={{
          default: { color: colors.onSurfaceVariant, fontFamily: materialFonts.regular.fontFamily },
          selected: { color: colors.onSurface, fontFamily: materialFonts.regular.fontFamily },
        }}
        indicatorColor={colors.secondaryContainer}
        rippleColor={colors.primary}>
        <NativeTabs.Trigger name="(home)" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon md="home" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="shows">
          <NativeTabs.Trigger.Icon md="tv" />
          <NativeTabs.Trigger.Label>Shows</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="books">
          <NativeTabs.Trigger.Icon md="book" />
          <NativeTabs.Trigger.Label>Books</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="movies">
          <NativeTabs.Trigger.Icon md="movie" />
          <NativeTabs.Trigger.Label>Movies</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Icon md="explore" />
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
