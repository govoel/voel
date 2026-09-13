import { useAtom } from '@effect/atom-react';
import { Button, Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import { containerRelativeFrame, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { Stack, router } from 'expo-router';
import { PlatformColor as platformColor } from 'react-native';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { Text } from '#src/components/text';
import { listUsersAtom } from '#src/features/accounts/server-users/list-atoms.ts';

const NativeServerUsersList = requireNativeView<{
  readonly users: ReadonlyArray<Pick<typeof AuthUser.Type, 'id' | 'username'>>;
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached: () => void;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
}>('ServerUsersList');

export default function ServerUsersScreen() {
  const [users, loadMoreUsers] = useAtom(listUsersAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1, backgroundColor: platformColor('systemGroupedBackground') }}>
        {AsyncResult.matchWithError(users, {
          onInitial: () => (
            <ProgressView
              modifiers={[
                containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                frame({ maxWidth: Infinity, maxHeight: Infinity }),
              ]}
            />
          ),
          onSuccess: ({ value: { items, done }, waiting }) => (
            <List modifiers={[headerProminence('increased')]}>
              <Section title="Manage users">
                <Button
                  onPress={() => {
                    router.push('/accounts/server/users/create');
                  }}>
                  <Text>Create user</Text>
                </Button>
              </Section>
              <Section title="Users">
                <NativeServerUsersList
                  users={items.map(({ id, username }) => ({ id, username }))}
                  waiting={waiting}
                  done={done}
                  onTap={({ nativeEvent: { id } }) => {
                    router.push(`/accounts/server/users/${id}`);
                  }}
                  onEndReached={() => {
                    if (!waiting && !done) {
                      loadMoreUsers();
                    }
                  }}
                />
              </Section>
            </List>
          ),
          onError: () => <Text>Error</Text>,
          onDefect: () => <Text>Defect</Text>,
        })}
      </Host>
    </>
  );
}
