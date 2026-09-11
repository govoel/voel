import { useAtomValue } from '@effect/atom-react';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import type { CommonViewModifierProps } from '@expo/ui/swift-ui';
import {
  containerRelativeFrame,
  createViewModifierEventListener,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { Stack, router } from 'expo-router';
import { PlatformColor as platformColor } from 'react-native';

import type { NativePager } from '@repo/native-paging';

import { usersPagerAtom } from '#src/app/accounts/server/users/index.ts';
import { Text } from '#src/components/text';
import type { ServerUser } from '#src/services/users.ts';

type ServerUsersListProps = CommonViewModifierProps & {
  readonly pager: NativePager<typeof ServerUser.Type>;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
};

const NativeServerUsersList = requireNativeView<ServerUsersListProps>('ServerUsersList');

const ServerUsersList = ({ modifiers, ...props }: ServerUsersListProps) => (
  <NativeServerUsersList
    {...props}
    {...(modifiers ? { modifiers, ...createViewModifierEventListener(modifiers) } : {})}
  />
);

export default function ServerUsersScreen() {
  const pager = useAtomValue(usersPagerAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1, backgroundColor: platformColor('systemGroupedBackground') }}>
        {AsyncResult.matchWithError(pager, {
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
              pager={value}
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
