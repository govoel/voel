import { Text } from '@expo/ui';
import { Stack } from 'expo-router';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.Title>Home</Stack.Screen.Title>

      <ScreenShell eyebrow="For you" title="Home">
        <Text textStyle={{ color: theme.textSecondary }}>Pick up where you left off.</Text>
      </ScreenShell>
    </>
  );
}
