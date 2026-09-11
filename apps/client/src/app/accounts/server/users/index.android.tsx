import { useAtom } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Column, Icon, LoadingIndicator, useMaterialColors } from '@expo/ui/jetpack-compose';
import type { PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import {
  createViewModifierEventListener,
  fillMaxWidth,
  padding,
} from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

type ServerUsersListProps = PrimitiveBaseProps & {
  readonly users: ReadonlyArray<Pick<typeof AuthUser.Type, 'id' | 'username'>>;
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached: () => void;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
  readonly children: ReactNode;
};

const NativeServerUsersList = requireNativeView<ServerUsersListProps>('ServerUsersList');

const ServerUsersList = ({ modifiers, ...props }: ServerUsersListProps) => (
  <NativeServerUsersList
    {...props}
    {...(modifiers ? { modifiers, ...createViewModifierEventListener(modifiers) } : {})}
  />
);

const Slot = requireNativeView<{
  readonly slotName: 'header' | 'leadingContent' | 'trailingContent';
  readonly children: ReactNode;
}>('ExpoUI', 'SlotView');

const ServerUsersStatus = ({ children }: { readonly children: ReactNode }) => (
  <Column
    verticalArrangement={{ spacedBy: Spacing.two }}
    modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}>
    <Text variant="h3">Manage Users</Text>
    {children}
  </Column>
);

export default function ServerUsersScreen() {
  const [users, loadMoreUsers] = useAtom(listUsersAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(users, {
        onInitial: () => (
          <ServerUsersStatus>
            <LoadingIndicator modifiers={[fillMaxWidth()]} />
          </ServerUsersStatus>
        ),
        onSuccess: ({ value: { items, done }, waiting }) => (
          <ServerUsersList
            modifiers={[fillMaxWidth()]}
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
            }}>
            <Slot slotName="header">
              <Text variant="h3">Manage Users</Text>
            </Slot>
            <Slot slotName="leadingContent">
              <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
            </Slot>
            <Slot slotName="trailingContent">
              <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
            </Slot>
          </ServerUsersList>
        ),
        onError: () => (
          <ServerUsersStatus>
            <Text>Error loading users</Text>
          </ServerUsersStatus>
        ),
        onDefect: () => (
          <ServerUsersStatus>
            <Text>Unable to load users</Text>
          </ServerUsersStatus>
        ),
      })}
    </AndroidAccountsSheet>
  );
}
