import { Text } from '@expo/ui';
import { Stack } from 'expo-router';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function ShowsScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.Title>Shows</Stack.Screen.Title>

      <ScreenShell eyebrow="Library" title="Shows">
        <Text textStyle={{ color: theme.textSecondary }}>
          Track seasons, episodes, and watchlists.
        </Text>
      </ScreenShell>
    </>
  );
}
