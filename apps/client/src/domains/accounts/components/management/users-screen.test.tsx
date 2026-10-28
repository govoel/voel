import { RegistryContext } from '@effect/atom-react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Array, Cause, DateTime, Option } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthUser } from '@repo/auth-api/shared.ts';

import AndroidUsersScreen from '#src/app/accounts/(selected)/server/users/index.android.tsx';
import IosUsersScreen from '#src/app/accounts/(selected)/server/users/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const layout = vi.hoisted(() => ({
  contentPadding: {} as { start?: number; end?: number; bottom?: number },
  onActionSizeChanged: (_size: { width: number; height: number }) => void 0,
}));

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://example.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
type UsersState = AsyncResult.AsyncResult<
  { readonly items: ReadonlyArray<typeof AuthUser.Type>; readonly done: boolean },
  Cause.NoSuchElementError
>;
const users = Atom.make<UsersState>(AsyncResult.initial(true));

// Substitute the query and native rendering boundaries, not the screen or atom hooks.
vi.mock('#src/app/accounts/(selected)/server/users/index.ts', () => ({
  listUsersAtom: () => users,
}));
vi.mock('#src/domains/accounts/scope.ts', () => ({ useSelectedAccount: () => account }));
vi.mock('expo-router', () => ({
  useRouter: () => navigation,
  Stack: {
    Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> },
    Toolbar: Object.assign(
      ({ children, placement }: PropsWithChildren<{ placement: string }>) => (
        <View testID={`toolbar-${placement}`}>{children}</View>
      ),
      {
        Button: ({
          children,
          accessibilityLabel,
          icon,
          onPress,
        }: PropsWithChildren<{
          accessibilityLabel: string;
          icon: string;
          onPress: () => void;
        }>) => (
          <Pressable role="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
            <Text testID="toolbar-icon">{icon}</Text>
            <Text>{children}</Text>
          </Pressable>
        ),
      }
    ),
  },
}));
vi.mock('@expo/material-symbols/add.xml', () => ({ default: 1 }));
vi.mock('@expo/material-symbols/chevron_right.xml', () => ({ default: 2 }));
vi.mock('@expo/ui', () => ({ Icon: () => null }));

const { Container, Items, NativeButton } = vi.hoisted(() => ({
  Container: ({ children }: PropsWithChildren) => <View>{children}</View>,
  Items: ({
    data,
    children,
  }: {
    data: ReadonlyArray<typeof AuthUser.Type>;
    children: (props: { item: typeof AuthUser.Type; index: number }) => ReactNode;
  }) => Array.map(data, (item, index) => <View key={item.id}>{children({ item, index })}</View>),
  NativeButton: ({
    children,
    onPress,
    accessibilityLabel,
  }: PropsWithChildren<{ onPress: () => void; accessibilityLabel?: string }>) => (
    <Pressable role="button" onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  ),
}));

vi.mock('@expo/ui/swift-ui', () => ({
  Host: Container,
  HStack: Container,
  Section: Container,
  Spacer: () => null,
  List: Object.assign(Container, { ForEach: Items }),
  Button: NativeButton,
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  font: () => ({}),
  foregroundStyle: () => ({}),
  frame: () => ({}),
  headerProminence: () => ({}),
  tint: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: Container,
  ModalBottomSheet: ({ children }: PropsWithChildren) => <View testID="sheet">{children}</View>,
  Box: ({ children, contentAlignment }: PropsWithChildren<{ contentAlignment: string }>) => (
    <View testID={`box-${contentAlignment}`}>{children}</View>
  ),
  Column: Container,
  Icon: () => null,
  LazyColumn: Object.assign(
    ({
      children,
      contentPadding,
    }: PropsWithChildren<{ contentPadding: Record<string, number> }>) => {
      layout.contentPadding = contentPadding;
      return <View testID="users-list">{children}</View>;
    },
    { Items }
  ),
  ExtendedFloatingActionButton: Object.assign(
    ({
      children,
      onClick,
      modifiers,
    }: PropsWithChildren<{
      onClick: () => void;
      modifiers: ReadonlyArray<{ contentDescription?: string }>;
    }>) => (
      <NativeButton
        onPress={onClick}
        accessibilityLabel={Array.findFirst(
          modifiers,
          (modifier) => modifier.contentDescription !== void 0
        ).pipe(
          Option.flatMap((modifier) => Option.fromUndefinedOr(modifier.contentDescription)),
          Option.getOrElse(() => '')
        )}>
        {children}
      </NativeButton>
    ),
    { Icon: Container, Text: Container }
  ),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxSize: () => ({}),
  padding: () => ({}),
  semantics: (props: { contentDescription: string }) => props,
  onSizeChanged: (handler: typeof layout.onActionSizeChanged) => {
    layout.onActionSizeChanged = handler;
    return {};
  },
}));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/components/list-state', () => ({
  ListState: ({ kind, message }: { kind: string; message?: string }) => (
    <Text>{message ?? kind}</Text>
  ),
}));
vi.mock('#src/components/pagination-footer', () => ({ PaginationFooter: () => null }));
vi.mock('#src/components/segmented-list/index.tsx', () => ({
  SegmentedListItem: Object.assign(
    ({ children, onClick }: PropsWithChildren<{ onClick: () => void }>) => (
      <NativeButton onPress={onClick}>{children}</NativeButton>
    ),
    { HeadlineContent: Container, TrailingContent: Container }
  ),
}));
vi.mock('#src/constants/material.ts', () => ({
  materialSeedColor: '#000000',
  useMaterialColors: () => ({ onSurfaceVariant: '#666666' }),
}));

const user = AuthUser.make({
  id: AuthUser.fields.id.make('reader'),
  username: AuthUser.fields.username.make('reader'),
  name: AuthUser.fields.name.make('Reader'),
  email: AuthUser.fields.email.make('reader@example.test'),
  role: AuthUser.fields.role.make('user'),
  image: AuthUser.fields.image.make(null),
  createdAt: AuthUser.fields.createdAt.make(DateTime.makeUnsafe(0)),
  updatedAt: AuthUser.fields.updatedAt.make(DateTime.makeUnsafe(0)),
});
const states: ReadonlyArray<{ name: string; state: UsersState; message: string }> = [
  { name: 'loading', state: AsyncResult.initial(true), message: 'loading' },
  {
    name: 'empty',
    state: AsyncResult.success({ items: [], done: true }),
    message: 'No users yet. Create a user to get started.',
  },
  {
    name: 'loaded',
    state: AsyncResult.success({ items: [user], done: true }),
    message: '@reader',
  },
  {
    name: 'error',
    state: AsyncResult.fail(new Cause.NoSuchElementError()),
    message: 'Unable to load users.',
  },
  {
    name: 'defect',
    state: AsyncResult.failure(Cause.die('offline')),
    message: 'Unable to load users.',
  },
];

const registries = new Set<AtomRegistry.AtomRegistry>();
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
});
beforeEach(() => {
  navigation.push.mockClear();
});

const renderUsers = async (Screen: ComponentType, state: UsersState) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  registry.set(users, state);
  return render(
    <RegistryContext.Provider value={registry}>
      <Screen />
    </RegistryContext.Provider>
  );
};

describe.each([
  { platform: 'iOS', Screen: IosUsersScreen },
  { platform: 'Android', Screen: AndroidUsersScreen },
])('$platform Manage Users', ({ platform, Screen }) => {
  it.each(states)(
    'keeps one accessible create action in the $name state',
    async ({ state, message }) => {
      await renderUsers(Screen, state);
      expect(screen.getByText(message)).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Create user' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Create user' }).props['accessibilityLabel']).toBe(
        'Create user'
      );
      const actionContainer =
        platform === 'iOS' ? screen.getByTestId('toolbar-right') : screen.getByTestId('sheet');
      await fireEvent.press(within(actionContainer).getByRole('button', { name: 'Create user' }));
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/accounts/server/users/create');
      if (platform === 'iOS') {
        expect(screen.getByTestId('toolbar-icon')).toHaveTextContent('plus');
      } else {
        expect(
          within(screen.getByTestId('users-list')).queryByRole('button', { name: 'Create user' })
        ).toBeNull();
        expect(
          within(screen.getByTestId('box-bottomEnd')).getByRole('button', { name: 'Create user' })
        ).toBeOnTheScreen();
      }
    }
  );
});

it('reserves scroll space for the measured Android FAB height and its margins', async () => {
  await renderUsers(AndroidUsersScreen, AsyncResult.success({ items: [user], done: true }));
  await act(() => {
    layout.onActionSizeChanged({ width: 220, height: 96 });
  });
  expect(layout.contentPadding.bottom).toBe(96 + Spacing.three * 2);
});
