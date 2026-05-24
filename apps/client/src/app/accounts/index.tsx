import { useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  Form,
  Group,
  HStack,
  Label,
  List,
  ProgressView,
  Section,
  SecureField,
  Spacer,
  TextField,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  font,
  foregroundStyle,
  frame,
  headerProminence,
  interactiveDismissDisabled,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { PlatformColor } from 'react-native';

import { Icon, iosTextStyle } from '#modules/design-system';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom } from '#src/services/accounts/atoms.ts';

export default function AccountsIndex() {
  const accounts = useAtomValue(accountsAtom);
  const [isPresented, setIsPresented] = useState(true);

  const [isAddPresented, setIsAddPresented] = useState(false);

  return (
    <>
      <Stack.Screen.Title>Switch Account</Stack.Screen.Title>

      <Host style={{ flex: 1 }}>
        <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
          <Group modifiers={[interactiveDismissDisabled()]}>
            <List modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
              <Section title="Switch Account">
                {AsyncResult.matchWithError(accounts, {
                  onInitial: () => (
                    <ProgressView
                      modifiers={[
                        containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                      ]}
                    />
                  ),
                  onSuccess: (result) =>
                    result.value.accounts.length === 0 ? (
                      <Text
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        No accounts
                      </Text>
                    ) : (
                      result.value.accounts.map((account) => (
                        <Button
                          modifiers={[tint('primary')]}
                          key={`${account.serverUrl}-${account.username}`}>
                          <HStack alignment="center" spacing={Spacing.two}>
                            <Icon
                              systemName="person.crop.circle.fill"
                              modifiers={[
                                iosTextStyle('largeTitle'),
                                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                              ]}
                            />

                            <VStack alignment="leading" spacing={Spacing.one}>
                              <Text>@{account.username}</Text>
                              <Text
                                variant="caption"
                                modifiers={[
                                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                                ]}>
                                {account.serverUrl}
                              </Text>
                            </VStack>

                            <Spacer />

                            <Icon
                              systemName="chevron.right"
                              modifiers={[
                                font({ textStyle: 'footnote', weight: 'semibold' }),
                                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                              ]}
                            />
                          </HStack>
                        </Button>
                      ))
                    ),
                  onError: () => <Text>Error</Text>,
                  onDefect: () => <Text>Defect</Text>,
                })}
              </Section>

              <Section>
                <Button
                  label="Add account"
                  systemImage="person.crop.circle.badge.plus"
                  onPress={() => {
                    setIsAddPresented(true);
                  }}
                />
              </Section>
            </List>

            <BottomSheet isPresented={isAddPresented} onIsPresentedChange={setIsAddPresented}>
              <VStack modifiers={[padding({ vertical: Spacing.three })]}>
                <Form modifiers={[headerProminence('increased')]}>
                  <Section title="Add an account">
                    <VStack alignment="leading" spacing={Spacing.one}>
                      <TextField placeholder="Username" />
                      <Label
                        title="Testing validation error"
                        modifiers={[
                          iosTextStyle('caption'),
                          foregroundStyle(PlatformColor('systemRed')),
                        ]}
                      />
                    </VStack>
                    <SecureField placeholder="Password" />
                  </Section>
                </Form>

                <Spacer />

                <VStack spacing={Spacing.two} modifiers={[padding({ horizontal: Spacing.three })]}>
                  <Button modifiers={[buttonStyle('borderedProminent')]}>
                    <Text modifiers={[frame({ maxWidth: Infinity })]}>Login</Text>
                  </Button>

                  <Button
                    role="destructive"
                    modifiers={[buttonStyle('bordered')]}
                    onPress={() => {
                      setIsAddPresented(false);
                    }}>
                    <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
                  </Button>
                </VStack>
              </VStack>
            </BottomSheet>
          </Group>
        </BottomSheet>
      </Host>
    </>
  );
}
