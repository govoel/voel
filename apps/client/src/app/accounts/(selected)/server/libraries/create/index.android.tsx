import { Column } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function CreateLibraryScreen() {
  return (
    <AndroidAccountsSheet>
      <Column
        modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h4">New Library</Text>
        <Text>Library creation is not available yet.</Text>
      </Column>
    </AndroidAccountsSheet>
  );
}
