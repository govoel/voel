import AccountCircle from '@expo/material-symbols/account_circle.xml';
import { Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/reactivity';

import { useSetActiveAccount } from '#src/app/accounts/index.ts';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import type { Account } from '#src/domains/accounts/schema.ts';

export const AccountPicker = ({
  accounts,
  onSelected,
}: {
  readonly accounts: ReadonlyArray<Account>;
  readonly onSelected: () => Promise<void>;
}) => {
  const [setActiveAccount, selectAccount] = useSetActiveAccount();
  const colors = useMaterialColors();
  return (
    <LazyColumn
      contentPadding={{
        start: Spacing.three,
        end: Spacing.three,
        bottom: Spacing.three,
      }}>
      <Text variant="h3" modifiers={[padding(0, 0, 0, Spacing.two)]}>
        Pick an Account
      </Text>
      <LazyColumn.Items
        data={accounts}
        keyExtractor={(account) => JSON.stringify([account.serverUrl.toString(), account.userId])}>
        {({ item, index }) => (
          <SegmentedListItem
            index={index}
            count={accounts.length}
            modifiers={[padding(0, 0, 0, index < accounts.length - 1 ? Spacing.half : 0)]}
            selected={item.active}
            enabled={!AsyncResult.isWaiting(setActiveAccount)}
            onClick={() => {
              void selectAccount({
                input: {
                  serverUrl: item.serverUrl,
                  userId: item.userId,
                },
                onSuccess: onSelected,
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
    </LazyColumn>
  );
};
