import { useAtom } from '@effect/atom-react';
import { Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import { containerRelativeFrame, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { Stack, router } from 'expo-router';
import type { ComponentType } from 'react';
import { PlatformColor } from 'react-native';

import { Text } from '#src/components/text';
import { listAccountsAtom } from '#src/services/accounts/atoms.ts';

interface ServerUsersListProps {
  readonly users: readonly { readonly id: string; readonly username: string }[];
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached: () => void;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
}

const NativeServerUsersList: ComponentType<ServerUsersListProps> =
  requireNativeView('ServerUsersList');

const ServerUsersList = (props: ServerUsersListProps) => <NativeServerUsersList {...props} />;

export default function ServerUsersScreen() {
  const [accounts, loadMoreAccounts] = useAtom(listAccountsAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1, backgroundColor: PlatformColor('systemGroupedBackground') }}>
        {AsyncResult.matchWithError(accounts, {
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
              <Section title="Users">
                <ServerUsersList
                  // @ts-expect-error - username exists, but better-auth doesn't type it
                  users={items}
                  waiting={waiting}
                  done={done}
                  onTap={({ nativeEvent: { id } }) => {
                    router.push(`/accounts/server/users/${id}`);
                  }}
                  onEndReached={() => {
                    if (!waiting && !done) {
                      loadMoreAccounts();
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
