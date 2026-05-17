import { Text } from '@expo/ui';
import { Stack } from 'expo-router';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function SearchScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.Title>Search</Stack.Screen.Title>
      <Stack.SearchBar placement="automatic" placeholder="Search" onChangeText={() => void 0} />

      <ScreenShell eyebrow="Explore" title="Search">
        <Text textStyle={{ color: theme.textSecondary }}>
          Search across shows, movies, and books.
        </Text>
      </ScreenShell>
    </>
  );
}
