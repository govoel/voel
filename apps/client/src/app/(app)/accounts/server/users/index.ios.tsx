import { useAtom, useAtomRefresh } from '@effect/atom-react';
import { Icon } from '@expo/ui';
import { Button, HStack, Host, List, Section, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, headerProminence, tint } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useRouter } from 'expo-router';

import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { Text } from '#src/components/text';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { listUsersAtom } from '#src/domains/accounts/features/server/users/model.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';

const ServerUsersContent = ({ accountKey }: { accountKey: AccountStorageKey }) => {
  const router = useRouter();
  const usersAtom = listUsersAtom(accountKey);
  const [users, loadMoreUsers] = useAtom(usersAtom);
  const refresh = useAtomRefresh(usersAtom);

  return (
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
                  {({ item }) => (
                    <Button
                      modifiers={[tint('primary')]}
                      onPress={() => {
                        router.push({
                          pathname: '/accounts/server/users/[id]',
                          params: { id: item.id },
                        });
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
                  )}
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
  );
};

export default function ServerUsersScreen() {
  const accountKey = useSelectedAccount();
  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <ServerUsersContent
          key={JSON.stringify([accountKey.serverUrl, accountKey.userId, accountKey.authStorageId])}
          accountKey={accountKey}
        />
      </Host>
    </>
  );
}
