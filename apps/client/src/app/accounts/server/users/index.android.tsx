import { useAtom, useAtomRefresh } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Button, Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export default function ServerUsersScreen() {
  const router = useRouter();
  const [users, loadMoreUsers] = useAtom(listUsersAtom);
  const refresh = useAtomRefresh(listUsersAtom);
  const colors = useMaterialColors();

  const count = AsyncResult.isSuccess(users) ? users.value.items.length : 0;
  const renderUser = useCallback(
    ({ item, index }: { item: typeof AuthUser.Type; index: number }) => (
      <SegmentedListItem
        index={index}
        count={count}
        onClick={() => {
          router.push({ pathname: '/accounts/server/users/[id]', params: { id: item.id } });
        }}>
        <SegmentedListItem.HeadlineContent>
          <Text>@{item.username}</Text>
        </SegmentedListItem.HeadlineContent>
        <SegmentedListItem.TrailingContent>
          <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
        </SegmentedListItem.TrailingContent>
      </SegmentedListItem>
    ),
    [count, router, colors.onSurfaceVariant]
  );

  return (
    <AndroidAccountsSheet>
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Manage Users</Text>
        <Button
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            router.push('/accounts/server/users/create');
          }}>
          <Text>Create user</Text>
        </Button>
        {AsyncResult.matchWithError(users, {
          onInitial: () => <ListState kind="loading" />,
          onSuccess: ({ value: page, waiting }) => (
            <>
              {page.items.length === 0 && page.done ? (
                <ListState kind="empty" message="No users yet. Create a user to get started." />
              ) : (
                <LazyColumn.Items data={page.items} keyExtractor={(user) => user.id}>
                  {renderUser}
                </LazyColumn.Items>
              )}
              <PaginationFooter
                key={page.items.length}
                page={page}
                waiting={waiting}
                onLoadMore={loadMoreUsers}
              />
            </>
          ),
          onError: (error) => (
            <ListState
              kind="error"
              message={Match.value(error).pipe(
                Match.tag('NoSuchElementError', () => 'Unable to load users.'),
                Match.orElse((failure) => authFailureMessage({ error: failure }))
              )}
              onRetry={refresh}
              retrying={users.waiting}
            />
          ),
          onDefect: () => (
            <ListState
              kind="error"
              message="Unable to load users."
              onRetry={refresh}
              retrying={users.waiting}
            />
          ),
        })}
      </LazyColumn>
    </AndroidAccountsSheet>
  );
}
