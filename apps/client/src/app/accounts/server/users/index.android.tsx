import { useAtom, useAtomRefresh } from '@effect/atom-react';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Button, Column, Icon, LoadingIndicator, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
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
  const refresh = useAtomRefresh(listUsersAtom);
  const colors = useMaterialColors();

  return (
    <AndroidAccountsSheet>
      <Column
        modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Manage Users</Text>
        <Button
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            router.push('/accounts/server/users/create');
          }}>
          <Text>Create user</Text>
        </Button>
        {AsyncResult.matchWithError(users, {
          onInitial: () => <LoadingIndicator modifiers={[fillMaxWidth()]} />,
          onSuccess: ({ value: { items, done }, waiting }) =>
            items.length === 0 ? (
              <Text color={colors.onSurfaceVariant}>
                No users yet. Create a user to get started.
              </Text>
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
                }}>
                <SlotNativeView slotName="trailingContent">
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </SlotNativeView>
              </NativeServerUsersList>
            ),
          onError: (error) => (
            <>
              <Text>
                {Match.value(error).pipe(
                  Match.tag('NoSuchElementError', () => 'Unable to load users.'),
                  Match.orElse((failure) => authFailureMessage({ error: failure }))
                )}
              </Text>
              <TextButton onClick={refresh} enabled={!users.waiting}>
                <Text>Retry</Text>
              </TextButton>
            </>
          ),
          onDefect: () => (
            <>
              <Text>Unable to load users.</Text>
              <TextButton onClick={refresh} enabled={!users.waiting}>
                <Text>Retry</Text>
              </TextButton>
            </>
          ),
        })}
      </Column>
    </AndroidAccountsSheet>
  );
}
