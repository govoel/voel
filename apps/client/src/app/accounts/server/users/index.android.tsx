import { useAtomValue } from '@effect/atom-react';
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

import { createPagedView } from '@repo/native-paging';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { usersPageLoaderAtom } from '#src/services/users.ts';
import type { ServerUser } from '#src/services/users.ts';

type ServerUsersListProps = PrimitiveBaseProps & {
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
  readonly children: ReactNode;
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
  const pages = useAtomValue(usersPageLoaderAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <AndroidAccountsSheet>
      {AsyncResult.matchWithError(pages, {
        onInitial: () => (
          <ServerUsersStatus>
            <LoadingIndicator modifiers={[fillMaxWidth()]} />
          </ServerUsersStatus>
        ),
        onSuccess: ({ value }) => (
          <ServerUsersList
            modifiers={[fillMaxWidth()]}
            key={value.key}
            fetchPage={value.fetchPage}
            onTap={({ nativeEvent: { id } }) => {
              router.push(`/accounts/server/users/${id}`);
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
