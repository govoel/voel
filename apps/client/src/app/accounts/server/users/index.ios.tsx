import { useAtom, useAtomRefresh } from '@effect/atom-react';
import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { Stack, useRouter } from 'expo-router';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';

const NativeServerUsersList = requireNativeView<{
  readonly users: ReadonlyArray<Pick<typeof AuthUser.Type, 'id' | 'username'>>;
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached: () => void;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
}>('ServerUsersList');

export default function ServerUsersScreen() {
  const router = useRouter();
  const [users, loadMoreUsers] = useAtom(listUsersAtom);
  const refresh = useAtomRefresh(listUsersAtom);

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
              onSuccess: ({ value: { items, done }, waiting }) =>
                items.length === 0 ? (
                  <ListState kind="empty" message="No users yet. Create a user to get started." />
                ) : (
                  <NativeServerUsersList
                    users={items.map(({ id, username }) => ({ id, username }))}
                    waiting={waiting}
                    done={done}
                    onTap={({ nativeEvent: { id } }) => {
                      router.push({ pathname: '/accounts/server/users/[id]', params: { id } });
                    }}
                    onEndReached={() => {
                      if (!waiting && !done) {
                        loadMoreUsers();
                      }
                    }}
                  />
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
