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
import { useRouter } from 'expo-router';

import { useSetActiveAccount } from '#src/app/accounts/index.ts';
import { ScreenHost } from '#src/components/screen-host';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import type { Account } from '#src/domains/accounts/schema.ts';

export const AccountPicker = ({
  accounts,
  onSelected,
  entryActions = false,
}: {
  readonly entryActions?: boolean;
  readonly accounts: ReadonlyArray<Account>;
  readonly onSelected?: () => Promise<void>;
}) => {
  const router = useRouter();
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
            JSON.stringify([account.serverUrl.toString(), account.userId])
          }>
          {({ item }) => (
            <Button
              modifiers={[tint('primary'), disabled(AsyncResult.isWaiting(setActiveAccount))]}
              onPress={() => {
                void selectAccount({
                  input: {
                    serverUrl: item.serverUrl,
                    userId: item.userId,
                  },
                  onSuccess: async () => {
                    await onSelected?.();
                  },
                });
              }}>
              <HStack alignment="center" spacing={Spacing.two}>
                <Icon
                  name={
                    item.active
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
                    {item.serverUrl.toString()}
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
      {entryActions ? (
        <Section>
          <Button
            label="Add account"
            onPress={() => {
              router.push('/sign-in');
            }}
          />
          <Button
            label="Set up new server"
            onPress={() => {
              router.push('/server-setup');
            }}
          />
        </Section>
      ) : null}
    </List>
  );
};

export const InlineAccountPicker = ({
  accounts,
}: {
  readonly accounts: ReadonlyArray<Account>;
}) => <ScreenHost>{() => <AccountPicker accounts={accounts} entryActions />}</ScreenHost>;
