import { Text } from 'react-native';

import { ScreenShell } from '#src/components/screen-shell.tsx';
import { useTheme } from '#src/hooks/use-theme.ts';

export default function ShowsScreen() {
  const theme = useTheme();

  return (
    <ScreenShell eyebrow="Library" title="Shows">
      <Text style={{ color: theme.textSecondary }}>Track seasons, episodes, and watchlists.</Text>
    </ScreenShell>
  );
}
