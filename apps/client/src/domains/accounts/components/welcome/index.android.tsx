import { Button, Column, LazyColumn, OutlinedButton } from '@expo/ui/jetpack-compose';
import { fillMaxSize, fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { useRouter } from 'expo-router';

import { ScreenHost } from '#src/components/screen-host';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export const Welcome = () => {
  const router = useRouter();
  const colors = useMaterialColors();

  return (
    <ScreenHost>
      {(contentTopInset) => (
        <LazyColumn
          verticalArrangement="bottom"
          contentPadding={{ top: contentTopInset + Spacing.three, bottom: Spacing.three }}
          modifiers={[fillMaxSize()]}>
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
        </LazyColumn>
      )}
    </ScreenHost>
  );
};
