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
  foregroundStyle,
  headerProminence,
  interactiveDismissDisabled,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useState } from 'react';

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
                    <Button key={`${account.serverUrl}-${account.username}`} />
                  )),
                onError: (error) => <Text>Error</Text>,
                onDefect: (defect) => <Text>Defect</Text>,
              })}
              <ProgressView />
              <Button modifiers={[buttonStyle('plain')]}>
                <HStack>
                  <VStack alignment="leading" spacing={2}>
                    <Text>@goknsh</Text>
                    <Text variant="caption">https://localhost:8080</Text>
                  </VStack>

                  <Spacer />
                  <Image systemName="chevron.right" size={29} color="secondaryLabel" />
                </HStack>
              </Button>
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
