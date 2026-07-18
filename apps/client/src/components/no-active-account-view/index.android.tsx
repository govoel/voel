import { Button, Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, weight } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';

import type { NoActiveAccountViewComponent } from '#src/components/no-active-account-view';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const NoActiveAccountView = (() => (
  <Column
    modifiers={[weight(1), fillMaxWidth()]}
    horizontalAlignment="center"
    verticalArrangement="center">
    <Column horizontalAlignment="center" verticalArrangement={{ spacedBy: Spacing.three }}>
      <Column horizontalAlignment="center" verticalArrangement={{ spacedBy: Spacing.one }}>
        <Text variant="h4">No active account</Text>
        <Text>Select or add an account to continue.</Text>
      </Column>

      <Button
        onClick={() => {
          router.push('/accounts');
        }}>
        <Text>Manage accounts</Text>
      </Button>
    </Column>
  </Column>
)) satisfies NoActiveAccountViewComponent;
