import { Column } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import type { LibraryEditorUnavailableComponent } from '#src/domains/library/components/editor-unavailable';

export const LibraryEditorUnavailable = (({ mode }) => (
  <AndroidAccountsSheet>
    <Column
      modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
      verticalArrangement={{ spacedBy: Spacing.two }}>
      <Text variant="h4">{mode === 'create' ? 'New Library' : 'Edit Library'}</Text>
      <ListState
        kind="message"
        message={
          mode === 'create'
            ? 'Library creation is not available yet.'
            : 'Library editing is not available yet.'
        }
      />
    </Column>
  </AndroidAccountsSheet>
)) satisfies LibraryEditorUnavailableComponent;
