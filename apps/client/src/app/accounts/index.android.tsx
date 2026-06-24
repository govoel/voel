import { useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import HostIcon from '@expo/material-symbols/host.xml';
import PersonAddIcon from '@expo/material-symbols/person_add.xml';
import {
  Column,
  FilledTonalButton,
  Icon,
  LoadingIndicator,
  Row,
  Spacer,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, paddingAll, width } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';

import { accountsWithActiveAccount } from '#src/app/accounts/index.tsx';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text/index.tsx';
import { Spacing } from '#src/constants/theme.ts';

export default function AccountsScreen() {
  const accounts = useAtomValue(accountsWithActiveAccount);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <AndroidAccountsSheet>
      <Column
        modifiers={[paddingAll(Spacing.three)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Switch Account</Text>

        {AsyncResult.matchWithError(accounts, {
          onInitial: () => (
            <Row horizontalAlignment="center">
              <LoadingIndicator modifiers={[fillMaxWidth()]} />
            </Row>
          ),
          onSuccess: (result) => (
            <SegmentedList>
              {result.value.accounts.length === 0 ? (
                <SegmentedListItem index={0} count={1} enabled={false}>
                  <SegmentedListItem.HeadlineContent>
                    <Text color={colors.onSurfaceVariant}>No accounts</Text>
                  </SegmentedListItem.HeadlineContent>
                </SegmentedListItem>
              ) : (
                result.value.accounts.map((account, index) => (
                  <SegmentedListItem
                    key={`${account.serverUrl.toString()}-${account.username}`}
                    index={index}
                    count={result.value.accounts.length}>
                    <SegmentedListItem.LeadingContent>
                      <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
                    </SegmentedListItem.LeadingContent>
                    <SegmentedListItem.HeadlineContent>
                      <Text>@{account.username}</Text>
                    </SegmentedListItem.HeadlineContent>
                    <SegmentedListItem.SupportingContent>
                      <Text variant="caption" color={colors.onSurfaceVariant}>
                        {account.serverUrl.toString()}
                      </Text>
                    </SegmentedListItem.SupportingContent>
                    <SegmentedListItem.TrailingContent>
                      <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                    </SegmentedListItem.TrailingContent>
                  </SegmentedListItem>
                ))
              )}
            </SegmentedList>
          ),
          onError: () => <Text modifiers={[paddingAll(Spacing.four)]}>Error</Text>,
          onDefect: () => <Text modifiers={[paddingAll(Spacing.four)]}>Defect</Text>,
        })}

        <FilledTonalButton
          onClick={() => {
            router.push('/accounts/add');
          }}
          modifiers={[fillMaxWidth()]}>
          <Icon source={PersonAddIcon} size={18} tint={colors.onSurfaceVariant} />
          <Spacer modifiers={[width(Spacing.two)]} />
          <Text>Add account</Text>
        </FilledTonalButton>

        <FilledTonalButton
          onClick={() => {
            router.push('/accounts/setup');
          }}
          modifiers={[fillMaxWidth()]}>
          <Icon source={HostIcon} size={18} tint={colors.onSurfaceVariant} />
          <Spacer modifiers={[width(Spacing.two)]} />
          <Text>Setup new server</Text>
        </FilledTonalButton>
      </Column>
    </AndroidAccountsSheet>
  );
}
