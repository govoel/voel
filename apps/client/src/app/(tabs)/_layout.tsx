import { Stack } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabsLayoutIOS() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <NativeTabs>
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(shows)">
          <NativeTabs.Trigger.Icon sf={{ default: 'tv', selected: 'tv.fill' }} />
          <NativeTabs.Trigger.Label>Shows</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(books)">
          <NativeTabs.Trigger.Icon sf={{ default: 'book', selected: 'book.fill' }} />
          <NativeTabs.Trigger.Label>Books</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(movies)">
          <NativeTabs.Trigger.Icon sf={{ default: 'film', selected: 'film.fill' }} />
          <NativeTabs.Trigger.Label>Movies</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(search)" role="search">
          <NativeTabs.Trigger.Icon />
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
