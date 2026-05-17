import { Text } from '@expo/ui';
import { Stack } from 'expo-router';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function MoviesScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.Title>Movies</Stack.Screen.Title>

      <ScreenShell eyebrow="Library" title="Movies">
        <Text textStyle={{ color: theme.textSecondary }}>
          Save films to watch, rate, and revisit.
        </Text>
      </ScreenShell>
    </>
  );
}
