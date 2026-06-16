import { useAtom, useAtomSet, useAtomSuspense } from '@effect/atom-react';
import { Group, Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import {
  containerRelativeFrame,
  foregroundStyle,
  headerProminence,
} from '@expo/ui/swift-ui/modifiers';
import { LegendList } from '@legendapp/list/react-native';
import { Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';

import { Text } from '#src/components/text';
import { activeAccountAuthClientAtom, listAccountsAtom } from '#src/services/accounts/atoms.ts';

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
                  <LegendList
                    recycleItems
                    data={items}
                    keyExtractor={(user) => user.id}
                    onEndReached={() => {
                      if (!waiting && !done) {
                        loadMoreAccounts();
                      }
                    }}
                    onEndReachedThreshold={0.5}
                    renderItem={({ item }) => <Text>@{item.email}</Text>}
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
