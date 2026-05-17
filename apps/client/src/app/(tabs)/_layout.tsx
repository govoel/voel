import { Stack } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { AccountAvatar } from '#src/components/account-avatar.tsx';

export default function TabsLayout() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <AccountAvatar />,
        }}
      />

      <NativeTabs>
        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Icon md="home" sf={{ default: 'house', selected: 'house.fill' }} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="shows">
          <NativeTabs.Trigger.Icon md="tv" sf={{ default: 'tv', selected: 'tv.fill' }} />
          <NativeTabs.Trigger.Label>Shows</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="books">
          <NativeTabs.Trigger.Icon md="book" sf={{ default: 'book', selected: 'book.fill' }} />
          <NativeTabs.Trigger.Label>Books</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="movies">
          <NativeTabs.Trigger.Icon md="movie" sf={{ default: 'film', selected: 'film.fill' }} />
          <NativeTabs.Trigger.Label>Movies</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" role="search">
          <NativeTabs.Trigger.Icon md="search" />
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      {/*<NativeTabs
        iconColor={{ default: theme.textSecondary, selected: theme.text }}
        labelStyle={{ default: { color: theme.textSecondary }, selected: { color: theme.text } }}
        tintColor={theme.text}>
        {tabs.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Icon md={tab.icon.md} sf={tab.icon.sf} />
            <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>*/}
    </>
  );
}
