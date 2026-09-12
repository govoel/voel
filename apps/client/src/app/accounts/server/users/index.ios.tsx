import { useAtomValue } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import type { CommonViewModifierProps } from '@expo/ui/swift-ui';
import {
  containerRelativeFrame,
  createViewModifierEventListener,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack, router } from 'expo-router';
import { PlatformColor as platformColor } from 'react-native';

import { createPagedView } from '@repo/native-paging';

import { Text } from '#src/components/text';
import { usersPageLoaderAtom } from '#src/services/users.ts';
import type { ServerUser } from '#src/services/users.ts';

type ServerUsersListProps = CommonViewModifierProps & {
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
};

const PagedServerUsersList = createPagedView<ServerUsersListProps, ServerUser>({
  name: 'ServerUsersList',
});

const ServerUsersList = ({ modifiers, ...props }: Parameters<typeof PagedServerUsersList>[0]) => (
  <PagedServerUsersList
    {...props}
    {...(modifiers ? { modifiers, ...createViewModifierEventListener(modifiers) } : {})}
  />
);

export default function ServerUsersScreen() {
  const pages = useAtomValue(usersPageLoaderAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1, backgroundColor: platformColor('systemGroupedBackground') }}>
        {AsyncResult.matchWithError(pages, {
          onInitial: () => (
            <ProgressView
              modifiers={[
                containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                frame({ maxWidth: Infinity, maxHeight: Infinity }),
              ]}
            />
          ),
          onSuccess: ({ value }) => (
            <ServerUsersList
              key={value.key}
              fetchPage={value.fetchPage}
              onTap={({ nativeEvent: { id } }) => {
                router.push(`/accounts/server/users/${id}`);
              }}
            />
          ),
          onError: () => <Text>Error</Text>,
          onDefect: () => <Text>Defect</Text>,
        })}
      </Host>
    </>
  );
}
