import { useAtom, useAtomRefresh } from '@effect/atom-react';
import { Button, Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useRouter } from 'expo-router';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { listUsersAtom } from '#src/domains/accounts/features/server/users/model.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';


const ServerUsersContent = ({ accountKey }: { accountKey: AccountStorageKey }) => {
  const router = useRouter();
  const usersAtom = listUsersAtom(accountKey);
  const [users, loadMoreUsers] = useAtom(usersAtom);
  const refresh = useAtomRefresh(usersAtom);
  const { onSurfaceVariant } = useMaterialColors();

  return (
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
                {({ item, index }) => (
                  <SegmentedListItem
                    index={index}
                    count={page.items.length}
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
  );
};

export default function ServerUsersScreen() {
  const accountKey = useSelectedAccount();
  return (
    <AndroidAccountsSheet>
      <ServerUsersContent key={JSON.stringify(accountKey)} accountKey={accountKey} />
    </AndroidAccountsSheet>
  );
}
