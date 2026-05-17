import { Stack } from 'expo-router';
import { Text } from 'react-native';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Title large>Home</Stack.Title>

      <ScreenShell eyebrow="For you" title="Home">
        <Text style={{ color: theme.textSecondary }}>Pick up where you left off.</Text>
      </ScreenShell>
    </>
  );
}
