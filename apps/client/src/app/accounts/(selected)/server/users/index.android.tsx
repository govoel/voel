import { useAtom, useAtomRefresh } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Button, Column, Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useRouter } from 'expo-router';

import { listUsersAtom } from '#src/app/accounts/(selected)/server/users/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';

export default function ServerUsersScreen() {
  const account = useSelectedAccount();
  const router = useRouter();
  const query = listUsersAtom(account);
  const [users, loadMoreUsers] = useAtom(query);
  const refresh = useAtomRefresh(query);
  const { onSurfaceVariant } = useMaterialColors();

  return (
    <AndroidAccountsSheet>
      <LazyColumn
        contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
        <Text variant="h3" modifiers={[padding(0, 0, 0, Spacing.two)]}>
          Manage Users
        </Text>
        <Button
          modifiers={[fillMaxWidth(), padding(0, 0, 0, Spacing.two)]}
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
                  {({ item, index }) => (
                    <SegmentedListItem
                      index={index}
                      count={page.items.length}
                      modifiers={[
                        padding(0, 0, 0, index < page.items.length - 1 ? Spacing.half : 0),
                      ]}
                      onClick={() => {
                        router.push({
                          pathname: '/accounts/server/users/[id]',
                          params: { id: item.id },
                        });
                      }}>
                      <SegmentedListItem.HeadlineContent>
                        <Text>@{item.username}</Text>
                      </SegmentedListItem.HeadlineContent>
                      <SegmentedListItem.TrailingContent>
                        <Icon source={ChevronRight} size={24} tint={onSurfaceVariant} />
                      </SegmentedListItem.TrailingContent>
                    </SegmentedListItem>
                  )}
                </LazyColumn.Items>
              )}
              {!page.done ? (
                <Column modifiers={[padding(0, Spacing.two, 0, 0)]}>
                  <PaginationFooter
                    key={page.items.length}
                    page={page}
                    waiting={waiting}
                    onLoadMore={loadMoreUsers}
                  />
                </Column>
              ) : null}
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
