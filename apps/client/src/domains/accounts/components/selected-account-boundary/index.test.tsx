/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { RegistryContext, useAtom, useAtomValue } from '@effect/atom-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Array, DateTime, Effect, Layer, ManagedRuntime, Option, Ref, Struct } from 'effect';
import { AsyncResult, AtomRegistry, Reactivity } from 'effect/reactivity';
import type { PropsWithChildren, ReactNode } from 'react';
import { Suspense, useContext, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import { activeUserProfileAtom } from '#src/app/accounts/(selected)/profile/index.ts';
import { deleteServerUserAtom } from '#src/app/accounts/(selected)/server/users/[id]/index.ts';
import { CryptoDigest } from '#src/domains/accounts/auth-client/crypto-digest.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AuthClientStorage } from '#src/domains/accounts/auth-client/storage.ts';
import { AccountsAutoPresenter } from '#src/domains/accounts/components/auto-presenter';
import { MainShell } from '#src/domains/accounts/components/main-shell';
import { AccountManagementBoundary } from '#src/domains/accounts/components/selected-account-boundary';
import { AccountManager, UuidGenerator } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('expo-router', () => ({
  useRouter: () => navigation,
  usePathname: () => '/',
  Redirect: ({ href }: { href: string }) => {
    navigation.replace(href);
    return null;
  },
}));
// Native rendering adapters only; the shell, picker, welcome, scope and queries are real.
vi.mock('#src/components/screen-host', () => ({
  ScreenHost: ({ children }: { children: (inset: number) => ReactNode }): ReactNode => children(0),
}));
vi.mock('#src/components/text', async () => {
  const native = await import('react-native');
  return { Text: native.Text };
});
vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));
vi.mock('@expo/ui', () => ({ Icon: () => null }));
vi.mock('@expo/ui/swift-ui', async () => {
  const native = await import('react-native');
  const react = await import('react');
  const Container = ({ children, header }: PropsWithChildren<{ header?: ReactNode }>) =>
    react.createElement(native.View, null, header, children);
  const List = Object.assign(Container, {
    ForEach: ({
      data,
      children,
    }: {
      data: ReadonlyArray<Account>;
      children: (props: { item: Account }) => ReactNode;
    }) =>
      Array.map(data, (item) => <native.View key={item.userId}>{children({ item })}</native.View>),
  });
  return {
    List,
    Section: Container,
    HStack: Container,
    VStack: Container,
    ScrollView: Container,
    Spacer: () => null,
    ProgressView: () => null,
    Button: ({
      children,
      label,
      onPress,
    }: PropsWithChildren<{ label?: string; onPress: () => void }>) => (
      <native.Pressable role="button" onPress={onPress}>
        <native.Text>{label}</native.Text>
        {children}
      </native.Pressable>
    ),
  };
});
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  defaultScrollAnchorForRole: () => ({}),
  buttonStyle: () => ({}),
  foregroundStyle: () => ({}),
  frame: () => ({}),
  padding: () => ({}),
  disabled: () => ({}),
  font: () => ({}),
  headerProminence: () => ({}),
  tint: () => ({}),
}));
vi.mock('#src/database/factory/react-native.ts', async () => {
  const effect = await import('effect');
  return { TursoSyncClientFactoryReactNativeLayer: effect.Layer.empty };
});
vi.mock('@repo/effect-atom-devtools-rozenite', async () => {
  const effect = await import('effect');
  return { AtomDevToolsLayer: effect.Layer.empty };
});
vi.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'Test phone' }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `voel://${path}` }));
vi.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => void 0 }) }));

const alice = {
  serverUrl: Account.fields.serverUrl.make('https://a.example.test'),
  userId: Account.fields.userId.make('alice'),
  authStorageId: Account.fields.authStorageId.make('alice-credentials'),
  username: Account.fields.username.make('alice'),
  name: Account.fields.name.make('Alice'),
  email: Account.fields.email.make('alice@example.test'),
  role: Account.fields.role.make('admin'),
  profilePicture: Account.fields.profilePicture.make(null),
  active: Account.fields.active.make(true),
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
} satisfies Account;
const bob = {
  ...alice,
  serverUrl: Account.fields.serverUrl.make('https://b.example.test'),
  userId: Account.fields.userId.make('bob'),
  username: Account.fields.username.make('bob'),
  name: Account.fields.name.make('Bob'),
  authStorageId: Account.fields.authStorageId.make('bob-credentials'),
  active: Account.fields.active.make(false),
} satisfies Account;

const fixtures = new Set<Awaited<ReturnType<typeof makeFixture>>>();
afterEach(async () => {
  await Promise.all(
    Array.map(Array.fromIterable(fixtures), async (fixture) => {
      fixture.registry.dispose();
      await fixture.runtime.dispose();
    })
  );
  fixtures.clear();
  vi.restoreAllMocks();
  navigation.push.mockClear();
  navigation.replace.mockClear();
});

// Substitute the persistence boundary, not atoms/components or selection logic.
// AccountManager and account invalidation run exactly as in the application.
const makeFixture = async (initial: ReadonlyArray<Account>) => {
  const rows = Ref.makeUnsafe([...initial]);
  const repository = Layer.mock(AccountRepository, {
    list: Ref.get(rows),
    getActive: Ref.get(rows).pipe(
      Effect.map((accounts) => Array.findFirst(accounts, (account) => account.active))
    ),
    getByStorageKey: (key) =>
      Ref.get(rows).pipe(
        Effect.map((accounts) =>
          Array.findFirst(
            accounts,
            (account) =>
              account.serverUrl === key.serverUrl &&
              account.userId === key.userId &&
              account.authStorageId === key.authStorageId
          )
        )
      ),
    setActive: (key) =>
      Ref.update(rows, (accounts) =>
        Array.map(accounts, (account) =>
          Struct.assign(account, {
            active: Account.fields.active.make(
              account.serverUrl === key.serverUrl && account.userId === key.userId
            ),
          })
        )
      ).pipe(Effect.as(void 0)),
  });
  const services = AccountManager.layerNoDeps.pipe(
    Layer.provideMerge(AuthClientMap.layerNoDeps),
    Layer.provideMerge(repository),
    Layer.provideMerge(
      Layer.mergeAll(
        Reactivity.layer,
        CryptoDigest.layerTest,
        UuidGenerator.layerTest,
        AuthClientStorage.layerTest(new Map())
      )
    )
  );
  const runtime = ManagedRuntime.make(services);
  const context = await runtime.runPromise(Effect.context<Layer.Success<typeof services>>());
  const registry = AtomRegistry.make({
    initialValues: [[AppRuntime.layer, Layer.succeedContext(context)]],
  });
  registry.mount(AppRuntime);
  await Effect.runPromise(AtomRegistry.getResult(registry, AppRuntime));
  const fixture = {
    runtime,
    registry,
    select: async (account: Account) =>
      runtime.runPromise(
        Effect.flatMap(AccountManager, (manager) => manager.setActiveAccount(account))
      ),
    replace: async (accounts: ReadonlyArray<Account>) =>
      runtime.runPromise(Ref.set(rows, [...accounts]).pipe(Reactivity.mutation(['account']))),
    render: async (children: ReactNode) =>
      render(
        <RegistryContext.Provider value={registry}>
          <Suspense fallback={<Text>Loading</Text>}>{children}</Suspense>
        </RegistryContext.Provider>
      ),
  };
  fixtures.add(fixture);
  return fixture;
};

const AccountContent = () => {
  const account = useSelectedAccount();
  const profileQuery = activeUserProfileAtom(account);
  const profile = useAtomValue(profileQuery);
  const registry = useContext(RegistryContext);
  const mutationAtom = deleteServerUserAtom(account);
  const [mutation, removeUser] = useAtom(mutationAtom);
  // An external observer can outlive the React subtree. Retain its mutation
  // until registry disposal to exercise fresh-scope isolation, not idle eviction.
  useEffect(() => {
    registry.mount(mutationAtom);
  }, [registry, mutationAtom]);
  const [draft, setDraft] = useState('Fresh draft');
  return (
    <>
      <Text>
        {AsyncResult.match(profile, {
          onInitial: () => 'Loading profile',
          onFailure: () => 'Profile failed',
          onSuccess: ({ value }) =>
            Option.match(value, { onNone: () => 'Missing profile', onSome: (user) => user.name }),
        })}
      </Text>
      <Text>{mutation._tag}</Text>
      <Pressable
        role="button"
        onPress={() => {
          removeUser({ userId: Account.fields.userId.make('missing-user') });
        }}>
        <Text>Delete missing user</Text>
      </Pressable>
      <Pressable
        role="button"
        onPress={() => {
          setDraft('Edited draft');
        }}>
        <Text>{draft}</Text>
      </Pressable>
    </>
  );
};

it('shows Welcome only without saved accounts, and the shared inline picker when none is selected', async () => {
  const fixture = await makeFixture([]);
  await fixture.render(
    <MainShell>
      <AccountContent />
    </MainShell>
  );
  expect(await screen.findByText('Welcome to Voel')).toBeOnTheScreen();
  await act(async () =>
    fixture.replace([Account.make({ ...alice, active: Account.fields.active.make(false) })])
  );
  expect(await screen.findByText('Pick an Account')).toBeOnTheScreen();
  expect(screen.getByText('@alice')).toBeOnTheScreen();
  expect(screen.getByText('Add account')).toBeOnTheScreen();
  expect(screen.getByText('Set up new server')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('@alice'));
  expect(await screen.findByText('Alice')).toBeOnTheScreen();
  expect(navigation.push).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it('remounts account content on A → B → A and credential changes, but updates profile metadata without losing drafts', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    Response.json(
      { code: 'FORBIDDEN', message: 'Not allowed' },
      { status: 403, headers: { 'content-type': 'application/json' } }
    )
  );
  const fixture = await makeFixture([alice, bob]);
  await fixture.render(
    <MainShell>
      <AccountContent />
    </MainShell>
  );
  expect(await screen.findByText('Alice')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Fresh draft'));
  await fireEvent.press(screen.getByText('Delete missing user'));
  expect(await screen.findByText('Failure')).toBeOnTheScreen();
  await act(async () =>
    fixture.replace([
      Account.make({ ...alice, name: Account.fields.name.make('Alice updated') }),
      bob,
    ])
  );
  expect(await screen.findByText('Alice updated')).toBeOnTheScreen();
  expect(screen.getByText('Edited draft')).toBeOnTheScreen();
  expect(screen.getByText('Failure')).toBeOnTheScreen();
  await act(async () => fixture.select(bob));
  expect(await screen.findByText('Bob')).toBeOnTheScreen();
  expect(screen.getByText('Initial')).toBeOnTheScreen();
  expect(screen.getByText('Fresh draft')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Fresh draft'));
  await act(async () => fixture.select(alice));
  expect(await screen.findByText('Alice updated')).toBeOnTheScreen();
  expect(screen.getByText('Initial')).toBeOnTheScreen();
  expect(screen.getByText('Fresh draft')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Fresh draft'));
  await act(async () =>
    fixture.replace([
      Account.make({
        ...alice,
        authStorageId: Account.fields.authStorageId.make('new-credentials'),
      }),
      bob,
    ])
  );
  expect(await screen.findByText('Fresh draft')).toBeOnTheScreen();
});

it('returns scoped management routes to /accounts when selection is lost', async () => {
  const fixture = await makeFixture([alice]);
  await fixture.render(
    <AccountManagementBoundary>
      <AccountContent />
    </AccountManagementBoundary>
  );
  expect(await screen.findByText('Alice')).toBeOnTheScreen();
  await act(async () =>
    fixture.replace([Account.make({ ...alice, active: Account.fields.active.make(false) })])
  );
  await waitFor(() => {
    expect(navigation.replace).toHaveBeenCalledWith('/accounts');
  });
  expect(screen.queryByText('Pick an Account')).not.toBeOnTheScreen();
  expect(screen.queryByText('Alice')).not.toBeOnTheScreen();
});

it('does not auto-present MustPickAccount, but still presents InvalidSession recovery', async () => {
  const fixture = await makeFixture([
    Account.make({ ...alice, active: Account.fields.active.make(false) }),
  ]);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('null', { headers: { 'content-type': 'application/json' } })
  );
  await fixture.render(
    <>
      <AccountsAutoPresenter />
      <MainShell>
        <AccountContent />
      </MainShell>
    </>
  );
  expect(await screen.findByText('Pick an Account')).toBeOnTheScreen();
  expect(navigation.push).not.toHaveBeenCalled();
  await act(async () => fixture.select(alice));
  await waitFor(() => {
    expect(navigation.push).toHaveBeenCalledWith('/accounts', { withAnchor: true });
  });
});
