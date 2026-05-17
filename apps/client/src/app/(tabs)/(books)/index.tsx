import { Text } from '@expo/ui';
import { Stack } from 'expo-router';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function BooksScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.Title>Books</Stack.Screen.Title>
      {/*<Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="star" />
      </Stack.Toolbar>*/}

      <ScreenShell eyebrow="Library" title="Books">
        <Text textStyle={{ color: theme.textSecondary }}>
          Keep your reading queue in one place.
        </Text>
      </ScreenShell>
    </>
  );
}
