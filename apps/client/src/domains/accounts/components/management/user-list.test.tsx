import { RegistryContext } from '@effect/atom-react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Clock, DateTime, Effect } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import type { PropsWithChildren, ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { AuthUser } from '@repo/auth-api/shared.ts';

import ServerUsersScreen from '#src/app/accounts/(selected)/server/users/index.ios.tsx';
import { listUsersAtom } from '#src/app/accounts/(selected)/server/users/index.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { Account, ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';

const { acquire, listUsers, push } = vi.hoisted(() => ({
  acquire: vi.fn<(account: ActiveAccountKey) => void>(),
  listUsers: vi.fn<AuthClient['Service']['admin']['listUsers']>(),
  push: vi.fn(),
}));

// Keep the real account-bound query, SWR and reactivity wrappers. Only its service
// boundary is replaced; acquiring a client and requesting a page remain observable.
vi.mock('#src/domains/accounts/auth-client/index.ts', async () => {
  const { Effect: MockEffect } = await import('effect');
  return {
    AuthClientMap: {
      use: <A, E, R>(
        f: (clients: {
          acquire: (account: ActiveAccountKey) => Effect.Effect<{
            admin: { listUsers: typeof listUsers };
          }>;
        }) => Effect.Effect<A, E, R>
      ) =>
        f({
          acquire: (account) =>
            MockEffect.sync(() => {
              acquire(account);
              return { admin: { listUsers } };
            }),
        }),
    },
  };
});
vi.mock('#src/runtime/index.ts', async () => {
  const { Layer } = await import('effect');
  const { Atom: MockAtom } = await import('effect/reactivity');
  return { AppRuntime: MockAtom.runtime(Layer.empty) };
});

// Native presentation adapters; the screen, query and pagination footer are real.
vi.mock('@expo/ui', () => ({ Icon: () => null }));
vi.mock('@expo/ui/swift-ui', async () => {
  const { Pressable, Text, View } = await import('react-native');
  const { Array } = await import('effect');
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- mock factories are hoisted
  const Container = ({ children }: PropsWithChildren) => <View>{children}</View>;
  return {
    Button: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => (
      <Pressable onPress={onPress}>{children}</Pressable>
    ),
    HStack: Container,
    Host: Container,
    List: Object.assign(Container, {
      ForEach: <T,>({
        data,
        keyExtractor,
        children,
      }: {
        data: ReadonlyArray<T>;
        keyExtractor: (item: T) => string;
        children: (props: { item: T }) => ReactNode;
      }) => Array.map(data, (item) => <View key={keyExtractor(item)}>{children({ item })}</View>),
    }),
    ProgressView: () => <Text>Loading</Text>,
    Section: Container,
    Spacer: () => null,
    Text,
  };
});
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  containerRelativeFrame: vi.fn(),
  disabled: vi.fn(),
  font: vi.fn(),
  foregroundStyle: vi.fn(),
  frame: vi.fn(),
  headerProminence: vi.fn(),
  onAppear: vi.fn(),
  onDisappear: vi.fn(),
  tint: vi.fn(),
}));
vi.mock('expo-router', async () => {
  const { Text } = await import('react-native');
  return { Stack: { Screen: { Title: Text } }, useRouter: () => ({ push }) };
});

const account = ActiveAccountKey.make({
  serverUrl: Account.fields.serverUrl.make('https://fixture.example.com'),
  userId: Account.fields.userId.make('fixture-admin'),
  authStorageId: Account.fields.authStorageId.make('fixture-storage'),
});
const user = AuthUser.make({
  id: AuthUser.fields.id.make('fixture-user'),
  username: AuthUser.fields.username.make('alex'),
  name: AuthUser.fields.name.make('Alex'),
  email: AuthUser.fields.email.make('alex@example.com'),
  role: AuthUser.fields.role.make('user'),
  image: AuthUser.fields.image.make(null),
  createdAt: AuthUser.fields.createdAt.make(DateTime.makeUnsafe(0)),
  updatedAt: AuthUser.fields.updatedAt.make(DateTime.makeUnsafe(0)),
});

afterEach(() => {
  vi.clearAllMocks();
});

it.each([
  { age: 0, revalidates: false },
  { age: 10_000, revalidates: true },
])(
  'renders a seeded user page (age: $age) and respects SWR freshness',
  async ({ age, revalidates }) => {
    const query = listUsersAtom(account);
    const now = await Effect.runPromise(Clock.currentTimeMillis);
    listUsers.mockImplementation(() =>
      Effect.succeed({
        users: [{ ...user, username: AuthUser.fields.username.make('alex-updated') }],
        total: 1,
      })
    );
    // This query already has a 10-second production freshness window. Unlike the
    // staleTime: 0 session queries, a fresh seed can avoid mount revalidation.
    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(
          query,
          AsyncResult.success({ items: [user], done: true }, { timestamp: now - age }),
          { skipInitialRun: true }
        ),
      ],
    });
    try {
      await render(
        <RegistryContext.Provider value={registry}>
          <SelectedAccountContext.Provider value={account}>
            <ServerUsersScreen />
          </SelectedAccountContext.Provider>
        </RegistryContext.Provider>
      );
      // Drain startup work rather than only checking the synchronous first render.
      await act(async () => {
        await Effect.runPromise(Effect.yieldNow);
      });

      if (!revalidates) {
        expect(screen.getByText('@alex')).toBeVisible();
        expect(acquire).not.toHaveBeenCalled();
        expect(listUsers).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByText('@alex'));
        expect(push).toHaveBeenCalledWith({
          pathname: '/accounts/server/users/[id]',
          params: { id: user.id },
        });

        await act(async () => {
          registry.refresh(query);
          await Effect.runPromise(Effect.yieldNow);
        });
      }

      // An explicit refresh (or mount revalidation of an expired seed) executes
      // the original query for this account and replaces the seeded page.
      expect(await screen.findByText('@alex-updated')).toBeVisible();
      expect(screen.queryByText('@alex')).toBeNull();
      expect(acquire).toHaveBeenCalledExactlyOnceWith(account);
      expect(listUsers).toHaveBeenCalledExactlyOnceWith({ limit: 10, offset: 0 });
    } finally {
      await screen.unmount();
      registry.dispose();
    }
  }
);
