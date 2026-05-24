import { useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  Group,
  HStack,
  List,
  ProgressView,
  Section,
  Spacer,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  font,
  foregroundStyle,
  headerProminence,
  interactiveDismissDisabled,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useState } from 'react';

import { Icon } from '#modules/design-system';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom } from '#src/services/accounts/atoms.ts';

export default function Accounts() {
  const [isPresented, setIsPresented] = useState(true);
  const accounts = useAtomValue(accountsAtom);

  return (
    <Host>
      <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
        <Group modifiers={[interactiveDismissDisabled()]}>
          <List modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
            <Section title="Switch Account">
              {AsyncResult.matchWithError(accounts, {
                onInitial: () => <ProgressView />,
                onSuccess: (result) =>
                  result.value.accounts.map((account) => (
                    <Button
                      modifiers={[buttonStyle('automatic'), tint('primary')]}
                      key={`${account.serverUrl}-${account.username}`}>
                      <HStack alignment="center" spacing={12}>
                        <Icon
                          systemName="person.crop.circle.fill"
                          modifiers={[
                            font({ size: 32 }),
                            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                          ]}
                        />

                        <VStack alignment="leading" spacing={2}>
                          <Text>{account.username}</Text>
                          <Text variant="caption">{account.serverUrl}</Text>
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
                  )),
                onError: () => <Text>Error</Text>,
                onDefect: () => <Text>Defect</Text>,
              })}

              <ProgressView
                modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
              />

              <Button modifiers={[tint('primary')]}>
                <HStack alignment="center" spacing={12}>
                  <Icon
                    systemName="person.crop.circle.fill"
                    modifiers={[
                      font({ size: 32 }),
                      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                    ]}
                  />

                  <VStack alignment="leading" spacing={2}>
                    <Text>@goknsh</Text>
                    <Text variant="caption">https://voel.ark.black</Text>
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
            </Section>

            <Section>
              <Button label="Add account" systemImage="person.crop.circle.badge.plus" />
            </Section>
          </List>
        </Group>
      </BottomSheet>
    </Host>
  );
}
