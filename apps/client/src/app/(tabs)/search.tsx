import { Text } from 'react-native';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function SearchScreen() {
  const theme = useTheme();

  return (
    <ScreenShell eyebrow="Explore" title="Search">
      <Text style={{ color: theme.textSecondary }}>Search across shows, movies, and books.</Text>
    </ScreenShell>
  );
}
