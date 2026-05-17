import { Text } from 'react-native';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function MoviesScreen() {
  const theme = useTheme();

  return (
    <ScreenShell eyebrow="Library" title="Movies">
      <Text style={{ color: theme.textSecondary }}>Save films to watch, rate, and revisit.</Text>
    </ScreenShell>
  );
}
