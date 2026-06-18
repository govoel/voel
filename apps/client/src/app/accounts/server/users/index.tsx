import { useAtom } from '@effect/atom-react';
import { Group, Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import { containerRelativeFrame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { Stack } from 'expo-router';
import type { ComponentType } from 'react';

import { Text } from '#src/components/text';
import { listAccountsAtom } from '#src/services/accounts/atoms.ts';

interface ServerUsersListProps {
  readonly users: readonly { readonly id: string; readonly username: string }[];
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached?: () => void;
}

type NativeServerUsersListProps = Omit<ServerUsersListProps, 'onEndReached'> & {
  readonly onEndReached?: (event: { nativeEvent: Record<string, never> }) => void;
};

const NativeServerUsersList: ComponentType<NativeServerUsersListProps> =
  requireNativeView('ServerUsersList');

const ServerUsersList = ({ onEndReached, ...props }: ServerUsersListProps) => (
  <NativeServerUsersList
    {...props}
    {...(onEndReached
      ? {
          onEndReached: () => {
            onEndReached();
          },
        }
      : {})}
  />
);

export default function ServerUsersScreen() {
  const [accounts, loadMoreAccounts] = useAtom(listAccountsAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          <List modifiers={[headerProminence('increased')]}>
            <Section title="Profile">
              {AsyncResult.matchWithError(accounts, {
                onInitial: () => (
                  <ProgressView
                    modifiers={[
                      containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                    ]}
                  />
                ),
                onSuccess: ({ value: { items, done }, waiting }) => (
                  <ServerUsersList
                    users={items}
                    waiting={waiting}
                    done={done}
                    onEndReached={() => {
                      if (!waiting && !done) {
                        loadMoreAccounts();
                      }
                    }}
                  />
                ),
                onError: () => <Text>Error</Text>,
                onDefect: () => <Text>Defect</Text>,
              })}
            </Section>
          </List>
        </Group>
      </Host>
    </>
  );
}
