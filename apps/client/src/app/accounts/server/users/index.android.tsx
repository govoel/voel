import { useAtom } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Column, Icon, LoadingIndicator, useMaterialColors } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { Action } from '#src/components/account-management/ui';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const NativeServerUsersList = requireNativeView<{
  readonly users: ReadonlyArray<Pick<typeof AuthUser.Type, 'id' | 'username'>>;
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached: () => void;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
  readonly children: ReactNode;
}>('ServerUsersList');

const SlotNativeView = requireNativeView<{
  readonly slotName: 'leadingContent' | 'trailingContent';
  readonly children: ReactNode;
}>('ExpoUI', 'SlotView');

export default function ServerUsersScreen() {
  const [users, loadMoreUsers] = useAtom(listUsersAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <AndroidAccountsSheet>
      <Column
        modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Manage Users</Text>
        <Action
          title="Create user"
          onPress={() => {
            router.push('/accounts/server/users/create');
          }}
        />
        {AsyncResult.matchWithError(users, {
          onInitial: () => <LoadingIndicator modifiers={[fillMaxWidth()]} />,
          onSuccess: ({ value: { items, done }, waiting }) => (
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
              }}>
              <SlotNativeView slotName="leadingContent">
                <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
              </SlotNativeView>
              <SlotNativeView slotName="trailingContent">
                <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
              </SlotNativeView>
            </NativeServerUsersList>
          ),
          onError: () => <Text>Error loading users</Text>,
          onDefect: () => <Text>Unable to load users</Text>,
        })}
      </Column>
    </AndroidAccountsSheet>
  );
}
