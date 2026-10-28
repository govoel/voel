import { Icon } from '@expo/ui';
import { Button, HStack, List, ProgressView, Section, Spacer, VStack } from '@expo/ui/swift-ui';
import {
  disabled,
  font,
  foregroundStyle,
  headerProminence,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/reactivity';

import { useSetActiveAccount } from '#src/app/accounts/index.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import type { Account } from '#src/domains/accounts/repository.ts';

export const AccountPicker = ({
  accounts,
  onSelected,
}: {
  readonly accounts: ReadonlyArray<typeof Account.Type>;
  readonly onSelected: () => Promise<void>;
}) => {
  const [setActiveAccount, selectAccount] = useSetActiveAccount();
  return (
    <List modifiers={[headerProminence('increased')]}>
      <Section
        header={
          <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
            Pick an Account
          </Text>
        }>
        <List.ForEach
          data={accounts}
          keyExtractor={(account) =>
            JSON.stringify([account.key.serverUrl.toString(), account.key.userId])
          }>
          {({ item }) => (
            <Button
              modifiers={[tint('primary'), disabled(AsyncResult.isWaiting(setActiveAccount))]}
              onPress={() => {
                void selectAccount({
                  input: item.key,
                  onSuccess: onSelected,
                });
              }}>
              <HStack alignment="center" spacing={Spacing.two}>
                <Icon
                  name={
                    item.active === true
                      ? 'person.crop.circle.fill.badge.checkmark'
                      : 'person.crop.circle.fill'
                  }
                  modifiers={[
                    font({ textStyle: 'largeTitle', weight: 'bold' }),
                    foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  ]}
                />

                <VStack alignment="leading" spacing={Spacing.one}>
                  <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
                    @{item.username}
                  </Text>
                  <Text
                    variant="caption"
                    modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {item.key.serverUrl.toString()}
                  </Text>
                </VStack>

                {AsyncResult.isWaiting(setActiveAccount) ? (
                  <>
                    <Spacer />
                    <ProgressView />
                  </>
                ) : null}
              </HStack>
            </Button>
          )}
        </List.ForEach>
      </Section>
    </List>
  );
};
