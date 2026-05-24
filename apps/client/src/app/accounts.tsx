import { useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  Group,
  HStack,
  Image,
  List,
  ProgressView,
  Section,
  Spacer,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  contentShape,
  font,
  foregroundStyle,
  headerProminence,
  interactiveDismissDisabled,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useState } from 'react';

import { DisclosureButton } from '#modules/design-system';
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
                    <DisclosureButton key={`${account.serverUrl}-${account.username}`}>
                      <HStack alignment="center" spacing={12}>
                        <Image
                          systemName="person.crop.circle.fill"
                          size={44}
                          color="secondaryLabel"
                        />

                        <VStack alignment="leading" spacing={2}>
                          <Text>{account.username}</Text>
                          <Text variant="caption">{account.serverUrl}</Text>
                        </VStack>
                      </HStack>
                    </DisclosureButton>
                  )),
                onError: () => <Text>Error</Text>,
                onDefect: () => <Text>Defect</Text>,
              })}
              <ProgressView />

              <DisclosureButton>
                <HStack alignment="center" spacing={12}>
                  <Image systemName="person.crop.circle.fill" size={32} color="secondaryLabel" />

                  <VStack alignment="leading" spacing={2}>
                    <Text>@goknsh</Text>
                    <Text variant="caption">https://voel.ark.black</Text>
                  </VStack>
                </HStack>
              </DisclosureButton>

              <Text>This section has increased prominence</Text>
              <Text>This section has increased prominence</Text>
              <Text>This section has increased prominence</Text>
              <Text>This section has increased prominence</Text>
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
