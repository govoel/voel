import { useAtom } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import {
  FilledTonalButton,
  Icon,
  LazyColumn,
  LoadingIndicator,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { router } from 'expo-router';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { listAccountsAtom } from '#src/services/accounts/atoms.ts';

export default function ServerUsersScreen() {
  const [accounts, loadMoreAccounts] = useAtom(listAccountsAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <AndroidAccountsSheet>
      <LazyColumn
        verticalArrangement={{ spacedBy: Spacing.two }}
        contentPadding={{
          start: Spacing.three,
          end: Spacing.three,
          bottom: Spacing.three,
        }}>
        <Text variant="h3">Manage Users</Text>
        {AsyncResult.matchWithError(accounts, {
          onInitial: () => <LoadingIndicator modifiers={[fillMaxWidth()]} />,
          onSuccess: ({ value: { items, done }, waiting }) => (
            <>
              <SegmentedList>
                {items.map((user, index) => (
                  <SegmentedListItem
                    key={user.id}
                    index={index}
                    count={items.length}
                    onClick={() => {
                      router.push(`/accounts/server/users/${user.id}`);
                    }}>
                    <SegmentedListItem.LeadingContent>
                      <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
                    </SegmentedListItem.LeadingContent>
                    <SegmentedListItem.HeadlineContent>
                      {/* @ts-expect-error - username exists, but better-auth doesn't type it */}
                      <Text>@{user.username}</Text>
                    </SegmentedListItem.HeadlineContent>
                    <SegmentedListItem.TrailingContent>
                      <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                    </SegmentedListItem.TrailingContent>
                  </SegmentedListItem>
                ))}
              </SegmentedList>
              {!done ? (
                <FilledTonalButton
                  enabled={!waiting}
                  modifiers={[fillMaxWidth()]}
                  onClick={() => {
                    loadMoreAccounts();
                  }}>
                  {waiting ? <LoadingIndicator /> : <Text>Load more</Text>}
                </FilledTonalButton>
              ) : null}
            </>
          ),
          onError: () => <Text>Error loading users</Text>,
          onDefect: () => <Text>Unable to load users</Text>,
        })}
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}
