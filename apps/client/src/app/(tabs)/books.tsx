import { Text } from 'react-native';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function BooksScreen() {
  const theme = useTheme();

  return (
    <ScreenShell eyebrow="Library" title="Books">
      <Text style={{ color: theme.textSecondary }}>Keep your reading queue in one place.</Text>
    </ScreenShell>
  );
}
