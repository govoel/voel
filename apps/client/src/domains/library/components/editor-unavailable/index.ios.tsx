import { Host, List, Section } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';

import { ListState } from '#src/components/list-state';
import type { LibraryEditorUnavailableComponent } from '#src/domains/library/components/editor-unavailable';

export const LibraryEditorUnavailable = (({ mode }) => (
  <>
    <Stack.Screen.Title>{mode === 'create' ? 'New Library' : 'Edit Library'}</Stack.Screen.Title>
    <Host style={{ flex: 1 }}>
      <List modifiers={[frame({ maxHeight: Infinity })]}>
        <Section>
          <ListState
            kind="message"
            message={
              mode === 'create'
                ? 'Library creation is not available yet.'
                : 'Library editing is not available yet.'
            }
          />
        </Section>
      </List>
    </Host>
  </>
)) satisfies LibraryEditorUnavailableComponent;
