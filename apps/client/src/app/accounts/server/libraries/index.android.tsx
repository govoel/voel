import { Column } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function ServerLibrariesScreen() {
  return (
    <AndroidAccountsSheet>
      <Column modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}>
        <Text variant="h3">Libraries</Text>
      </Column>
    </AndroidAccountsSheet>
  );
}
