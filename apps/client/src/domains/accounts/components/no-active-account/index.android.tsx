import { Button, Column } from '@expo/ui/jetpack-compose';
import { fillMaxSize, padding } from '@expo/ui/jetpack-compose/modifiers';
import { useRouter } from 'expo-router';

import { ScreenHost } from '#src/components/screen-host';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const NoActiveAccount = () => {
  const router = useRouter();

  return (
    <ScreenHost>
      {(contentTopInset) => (
        <Column
          modifiers={[
            fillMaxSize(),
            padding(Spacing.three, contentTopInset + Spacing.three, Spacing.three, Spacing.three),
          ]}
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
      )}
    </ScreenHost>
  );
};
