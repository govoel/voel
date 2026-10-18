import { Button, Column, OutlinedButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { useRouter } from 'expo-router';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export const Welcome = () => {
  const router = useRouter();
  const colors = useMaterialColors();

  return (
    <SafeScrollView>
      <Column
        verticalArrangement={{ spacedBy: Spacing.four }}
        modifiers={[
          fillMaxWidth(),
          padding(Spacing.four, Spacing.four, Spacing.four, Spacing.four),
        ]}>
        <Text variant="h1">Welcome to Voel</Text>
        <Text color={colors.onSurfaceVariant}>
          Connect to your server to get started. Add an existing account or set up a new server.
        </Text>
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Button
            modifiers={[fillMaxWidth()]}
            onClick={() => {
              router.push('/sign-in');
            }}>
            <Text>Add account</Text>
          </Button>
          <OutlinedButton
            modifiers={[fillMaxWidth()]}
            onClick={() => {
              router.push('/server-setup');
            }}>
            <Text>Set up new server</Text>
          </OutlinedButton>
        </Column>
      </Column>
    </SafeScrollView>
  );
};
