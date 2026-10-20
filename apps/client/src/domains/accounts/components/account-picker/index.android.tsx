import AccountCircle from '@expo/material-symbols/account_circle.xml';
import { Button, Column, Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxSize, padding } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/reactivity';
import { useRouter } from 'expo-router';

import { useSetActiveAccount } from '#src/app/accounts/index.ts';
import { ScreenHost } from '#src/components/screen-host';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
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
  const colors = useMaterialColors();
  return (
    <LazyColumn
      contentPadding={{
        start: Spacing.three,
        end: Spacing.three,
        bottom: Spacing.three,
      }}
      verticalArrangement={{ spacedBy: Spacing.two }}>
      <Text variant="h3">Pick an Account</Text>
      <LazyColumn.Items
        data={accounts}
        keyExtractor={(account) => JSON.stringify([account.serverUrl.toString(), account.userId])}>
        {({ item, index }) => (
          <SegmentedListItem
            index={index}
            count={accounts.length}
            selected={item.active}
            enabled={!AsyncResult.isWaiting(setActiveAccount)}
            onClick={() => {
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
            <SegmentedListItem.LeadingContent>
              <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
            </SegmentedListItem.LeadingContent>
            <SegmentedListItem.HeadlineContent>
              <Text>@{item.username}</Text>
            </SegmentedListItem.HeadlineContent>
            <SegmentedListItem.SupportingContent>
              <Text variant="caption" color={colors.onSurfaceVariant}>
                {item.serverUrl.toString()}
              </Text>
            </SegmentedListItem.SupportingContent>
          </SegmentedListItem>
        )}
      </LazyColumn.Items>
      {entryActions ? (
        <>
          <Button
            onClick={() => {
              router.push('/sign-in');
            }}>
            <Text>Add account</Text>
          </Button>
          <Button
            onClick={() => {
              router.push('/server-setup');
            }}>
            <Text>Set up new server</Text>
          </Button>
        </>
      ) : null}
    </LazyColumn>
  );
};

export const InlineAccountPicker = ({
  accounts,
}: {
  readonly accounts: ReadonlyArray<Account>;
}) => (
  <ScreenHost>
    {(contentTopInset) => (
      <Column modifiers={[fillMaxSize(), padding(0, contentTopInset, 0, 0)]}>
        <AccountPicker accounts={accounts} entryActions />
      </Column>
    )}
  </ScreenHost>
);
