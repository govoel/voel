import { Stack, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { AccountAvatar } from '#src/components/account-avatar.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

const tabIcons = {
  home: { sf: { default: 'house', selected: 'house.fill' }, md: 'home' },
  shows: { sf: { default: 'tv', selected: 'tv.fill' }, md: 'tv' },
  movies: { sf: { default: 'film', selected: 'film.fill' }, md: 'movie' },
  books: { sf: { default: 'book', selected: 'book.fill' }, md: 'book' },
  search: { sf: 'magnifyingglass', md: 'search' },
} as const;

const tabs = [
  { name: 'home', title: 'Home', icon: tabIcons.home },
  { name: 'shows', title: 'Shows', icon: tabIcons.shows },
  { name: 'search', title: 'Search', icon: tabIcons.search },
  { name: 'movies', title: 'Movies', icon: tabIcons.movies },
  { name: 'books', title: 'Books', icon: tabIcons.books },
] as const;

export default function TabsLayout() {
  const theme = useTheme();
  const pathname = usePathname();
  const selectedTab = tabs.find((tab) => pathname.split('/').includes(tab.name)) ?? tabs[0];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <AccountAvatar />,
          headerShadowVisible: false,
          headerShown: true,
          headerTitle: selectedTab.title,
          headerTintColor: theme.text,
        }}
      />
      <NativeTabs
        iconColor={{ default: theme.textSecondary, selected: theme.text }}
        labelStyle={{ default: { color: theme.textSecondary }, selected: { color: theme.text } }}
        tintColor={theme.text}>
        {tabs.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Icon md={tab.icon.md} sf={tab.icon.sf} />
            <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    </>
  );
}
