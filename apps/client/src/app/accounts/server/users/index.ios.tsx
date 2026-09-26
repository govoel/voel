import { useAtom, useAtomRefresh } from '@effect/atom-react';
import { Icon } from '@expo/ui';
import { Button, HStack, Host, List, Section, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, headerProminence, tint } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { Text } from '#src/components/text';

export default function ServerUsersScreen() {
  const router = useRouter();
  const [users, loadMoreUsers] = useAtom(listUsersAtom);
  const refresh = useAtomRefresh(listUsersAtom);

  const renderUser = useCallback(
    ({ item }: { item: typeof AuthUser.Type }) => (
      <Button
        modifiers={[tint('primary')]}
        onPress={() => {
          router.push({ pathname: '/accounts/server/users/[id]', params: { id: item.id } });
        }}>
        <HStack>
          <Text>@{item.username}</Text>
          <Spacer />
          <Icon
            name="chevron.right"
            modifiers={[
              font({ textStyle: 'footnote', weight: 'semibold' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          />
        </HStack>
      </Button>
    ),
    [router]
  );

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <Button
            onPress={() => {
              router.push('/accounts/server/users/create');
            }}>
            <Text>Create user</Text>
          </Button>

          <Section title="Users">
            {AsyncResult.matchWithError(users, {
              onInitial: () => <ListState kind="loading" />,
              onSuccess: ({ value: page, waiting }) => (
                <>
                  {page.items.length === 0 && page.done ? (
                    <ListState kind="empty" message="No users yet. Create a user to get started." />
                  ) : (
                    <List.ForEach data={page.items} keyExtractor={(user) => user.id}>
                      {renderUser}
                    </List.ForEach>
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
          </Section>
        </List>
      </Host>
    </>
  );
}
