import { Button, Column, Host, Surface, getMaterialColors } from '@expo/ui/jetpack-compose';
import { fillMaxSize, fillMaxWidth, padding, weight } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NoActiveAccountViewComponent } from '#src/components/no-active-account-view';
import { StatusBarGradient } from '#src/components/safe-scroll-view/status-bar-gradient.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const NoActiveAccountView = (({ header }) => {
  const { top } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const paddingTop = headerHeight > 0 ? 0 : top;

  const colorScheme = useColorScheme();
  const { background } = getMaterialColors({
    scheme: colorScheme === 'light' ? 'light' : 'dark',
    seedColor: '#00AAFF',
  });

  return (
    <>
      <StatusBarGradient backgroundColor={background} />

      <Host seedColor="#00AAFF" style={{ flex: 1 }}>
        <Surface modifiers={[fillMaxSize()]}>
          <Column
            modifiers={[
              fillMaxSize(),
              padding(Spacing.three, paddingTop + Spacing.three, Spacing.three, Spacing.three),
            ]}
            horizontalAlignment="start">
            {header}

            <Column
              modifiers={[weight(1), fillMaxWidth()]}
              horizontalAlignment="center"
              verticalArrangement="center">
              <Column
                horizontalAlignment="center"
                verticalArrangement={{ spacedBy: Spacing.three }}>
                <Column
                  horizontalAlignment="center"
                  verticalArrangement={{ spacedBy: Spacing.one }}>
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
          </Column>
        </Surface>
      </Host>
    </>
  );
}) satisfies NoActiveAccountViewComponent;
