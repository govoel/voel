import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import {
  Array,
  DateTime,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Ref,
  String,
  Struct,
  pipe,
} from 'effect';
import { AsyncResult, AtomRegistry, Reactivity } from 'effect/reactivity';
import type { PropsWithChildren, ReactNode } from 'react';
import { Suspense, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import { activeUserProfileAtom } from '#src/app/accounts/(selected)/profile/index.ts';
import { deleteServerUser } from '#src/app/accounts/(selected)/server/users/[id]/index.ts';
import { useAppForm } from '#src/components/form';
import { NoFormInput, useSubmitState } from '#src/components/form/hooks.tsx';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AccountPicker } from '#src/domains/accounts/components/account-picker';
import { AccountsAutoPresenter } from '#src/domains/accounts/components/auto-presenter';
import { MainShell } from '#src/domains/accounts/components/main-shell';
import { AccountManagementBoundary } from '#src/domains/accounts/components/selected-account-boundary';
import { AccountEncryptionKeyTestLayer } from '#src/domains/accounts/encryption/testing.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { Account, AccountRepository } from '#src/domains/accounts/repository.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const navigation = vi.hoisted(() => ({ pathname: '/', push: vi.fn(), replace: vi.fn() }));
vi.mock('expo-router', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  Redirect: ({ href }: { href: string }) => {
    navigation.replace(href);
    return null;
  },
}));
vi.mock('#src/components/screen-host', () => ({
  ScreenHost: ({ children }: { children: (inset: number) => ReactNode }): ReactNode => children(0),
}));
vi.mock('#src/components/text', async () => {
  const native = await import('react-native');
  return { Text: native.Text };
});
vi.mock('#src/components/form', async () => {
  const hooks = await import('#src/components/form/hooks.tsx');
  const { AppRuntime: runtime } = await import('#src/runtime/index.ts');
  return hooks.createEffectSchemaFormHook({
    runtime,
    fieldContext: hooks.fieldContext,
    formContext: hooks.formContext,
    fieldComponents: {},
    formComponents: {},
  });
});
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
      data: ReadonlyArray<typeof Account.Type>;
      children: (props: { item: typeof Account.Type }) => ReactNode;
    }) =>
      Array.map(data, (item) => (
        <native.View key={item.key.userId}>{children({ item })}</native.View>
      )),
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
  multilineTextAlignment: () => ({}),
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
  key: AccountKey.make({
    serverUrl: AccountKey.fields.serverUrl.make('https://a.example.test'),
    userId: AccountKey.fields.userId.make('alice'),
  }),
  username: Account.fields.username.make('alice'),
  name: Account.fields.name.make('Alice'),
  email: Account.fields.email.make('alice@example.test'),
  role: Account.fields.role.make('admin'),
  profilePicture: Account.fields.profilePicture.make(null),
  active: Account.fields.active.make(true),
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
} satisfies typeof Account.Type;
const bob = Struct.assign(alice, {
  key: AccountKey.make({
    serverUrl: AccountKey.fields.serverUrl.make('https://b.example.test'),
    userId: AccountKey.fields.userId.make('bob'),
  }),
  username: Account.fields.username.make('bob'),
  name: Account.fields.name.make('Bob'),
  active: Account.fields.active.make(false),
}) satisfies typeof Account.Type;

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
  navigation.pathname = '/';
  navigation.push.mockClear();
  navigation.replace.mockClear();
});

const makeFixture = async (initial: ReadonlyArray<typeof Account.Type>) => {
  const rows = Ref.makeUnsafe([...initial]);
  const repository = Layer.mock(AccountRepository, {
    readAuthStorage: () => Effect.succeed({}),
    writeAuthStorageItem: () => Effect.void,
    list: Ref.get(rows),
    getActiveKey: Ref.get(rows).pipe(
      Effect.map(Array.findFirst((account) => account.active)),
      Effect.map(Option.map((account) => account.key))
    ),
    findByKey: (key) =>
      Ref.get(rows).pipe(
        Effect.map(
          Array.findFirst(
            (account) =>
              account.key.serverUrl === key.serverUrl && account.key.userId === key.userId
          )
        )
      ),
    setActive: (key) =>
      Ref.update(
        rows,
        Array.map((account) =>
          Struct.assign(account, {
            active: Account.fields.active.make(
              account.key.serverUrl === key.serverUrl && account.key.userId === key.userId
            ),
          })
        )
      ).pipe(Effect.as(void 0), Reactivity.mutation(['account'])),
  });
  const services = AccountManager.layerNoDeps.pipe(
    Layer.provideMerge(AuthClientMap.layerNoDeps),
    Layer.provideMerge(repository),
    Layer.provideMerge([Reactivity.layer, AccountEncryptionKeyTestLayer])
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
    select: async (account: typeof Account.Type) =>
      runtime.runPromise(
        Effect.flatMap(AccountManager, (manager) => manager.setActiveAccount(account.key))
      ),
    replace: async (accounts: ReadonlyArray<typeof Account.Type>) =>
      runtime.runPromise(Ref.set(rows, [...accounts]).pipe(Reactivity.mutation(['account']))),
    render: async (element: Parameters<typeof render>[0]) =>
      render(element, {
        wrapper: ({ children }: PropsWithChildren) => (
          <RegistryContext.Provider value={registry}>
            <Suspense fallback={<Text>Loading</Text>}>{children}</Suspense>
          </RegistryContext.Provider>
        ),
      }),
  };
  fixtures.add(fixture);
  return fixture;
};

const DeleteUser = () => {
  const { form, isSubmitting, errorMessage } = useSubmitState();
  return (
    <>
      <Text>{Option.getOrElse(errorMessage, () => 'Ready to delete user')}</Text>
      <Pressable role="button" disabled={isSubmitting} onPress={() => void form.handleSubmit()}>
        <Text>Delete missing user</Text>
      </Pressable>
    </>
  );
};

const AccountContent = () => {
  const account = useSelectedAccount();
  const profileQuery = activeUserProfileAtom(account);
  const profile = useAtomValue(profileQuery);
  const form = useAppForm({
    schema: NoFormInput,
    onSubmit: () =>
      deleteServerUser({
        account,
        input: { userId: AccountKey.fields.userId.make('missing-user') },
      }),
    onFailure: () => 'Could not delete user',
  });
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
      <form.AppForm>
        <DeleteUser />
      </form.AppForm>
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

const PresentedMainShell = () => (
  <>
    <AccountsAutoPresenter />
    <MainShell>
      <AccountContent />
    </MainShell>
  </>
);

it('requires a selected-account provider instead of inventing an account', async () => {
  await expect(renderHook(() => useSelectedAccount())).rejects.toThrow(/SelectedAccountBoundary/u);
});

it('shows Welcome without saved accounts, then one shared no-account page until an account is selected', async () => {
  const fixture = await makeFixture([]);
  await fixture.render(
    <>
      <AccountsAutoPresenter />
      <MainShell>
        <AccountContent />
      </MainShell>
    </>
  );
  expect(await screen.findByText('Welcome to Voel')).toBeOnTheScreen();
  expect(screen.queryByText('Fresh draft')).not.toBeOnTheScreen();
  expect(navigation.push).not.toHaveBeenCalled();
  await act(async () =>
    fixture.replace([Struct.assign(alice, { active: Account.fields.active.make(false) })])
  );
  expect(await screen.findByText('No active account')).toBeOnTheScreen();
  expect(screen.getAllByText('No active account')).toHaveLength(1);
  expect(screen.getByText('Select or add an account to continue.')).toBeOnTheScreen();
  expect(screen.queryByText('Welcome to Voel')).not.toBeOnTheScreen();
  expect(screen.queryByText('Pick an Account')).not.toBeOnTheScreen();
  expect(screen.queryByText('Fresh draft')).not.toBeOnTheScreen();
  await waitFor(() => {
    expect(navigation.push).toHaveBeenCalledWith('/accounts', { withAnchor: true });
  });
  navigation.push.mockClear();
  await fireEvent.press(screen.getByText('Manage accounts'));
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/accounts');
  await act(async () => fixture.select(alice));
  expect(await screen.findByText('Alice')).toBeOnTheScreen();
  expect(screen.getByText('Fresh draft')).toBeOnTheScreen();
  expect(screen.queryByText('No active account')).not.toBeOnTheScreen();
});

it('selects a saved account through the modal picker and closes it after scoped content becomes available', async () => {
  const fixture = await makeFixture([
    Struct.assign(alice, { active: Account.fields.active.make(false) }),
  ]);
  const Picker = () => {
    const [presented, setPresented] = useState(true);
    return (
      <>
        <MainShell>
          <AccountContent />
        </MainShell>
        {presented ? (
          <AccountPicker
            accounts={[alice]}
            onSelected={async () => {
              setPresented(false);
            }}
          />
        ) : null}
      </>
    );
  };
  await fixture.render(<Picker />);
  expect(await screen.findByText('No active account')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('@alice'));
  expect(await screen.findByText('Alice')).toBeOnTheScreen();
  expect(screen.getByText('Fresh draft')).toBeOnTheScreen();
  expect(screen.queryByText('Pick an Account')).not.toBeOnTheScreen();
  expect(screen.queryByText('No active account')).not.toBeOnTheScreen();
});

it('remounts account content on A → B → A, but updates profile metadata without losing drafts', async () => {
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
  expect(await screen.findByText('Could not delete user')).toBeOnTheScreen();
  await act(async () =>
    fixture.replace([
      Struct.assign(alice, { name: Account.fields.name.make('Alice updated') }),
      bob,
    ])
  );
  expect(await screen.findByText('Alice updated')).toBeOnTheScreen();
  expect(screen.getByText('Edited draft')).toBeOnTheScreen();
  expect(screen.getByText('Could not delete user')).toBeOnTheScreen();
  await act(async () => fixture.select(bob));
  expect(await screen.findByText('Bob')).toBeOnTheScreen();
  expect(screen.getByText('Ready to delete user')).toBeOnTheScreen();
  expect(screen.getByText('Fresh draft')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Fresh draft'));
  await act(async () => fixture.select(alice));
  expect(await screen.findByText('Alice updated')).toBeOnTheScreen();
  expect(screen.getByText('Ready to delete user')).toBeOnTheScreen();
  expect(screen.getByText('Fresh draft')).toBeOnTheScreen();
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
    fixture.replace([Struct.assign(alice, { active: Account.fields.active.make(false) })])
  );
  await waitFor(() => {
    expect(navigation.replace).toHaveBeenCalledWith('/accounts');
  });
  expect(screen.queryByText('Pick an Account')).not.toBeOnTheScreen();
  expect(screen.queryByText('Alice')).not.toBeOnTheScreen();
});

it('automatically presents the mandatory account picker once across account list and route updates', async () => {
  const fixture = await makeFixture([
    Struct.assign(alice, { active: Account.fields.active.make(false) }),
  ]);
  const view = await fixture.render(<AccountsAutoPresenter />);
  await waitFor(() => {
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/accounts', { withAnchor: true });
  });
  await act(async () =>
    fixture.replace([Struct.assign(alice, { active: Account.fields.active.make(false) }), bob])
  );
  navigation.pathname = '/movies';
  await view.rerender(<AccountsAutoPresenter />);
  expect(navigation.push).toHaveBeenCalledTimes(1);
});

it.each(['/accounts', '/accounts/profile', '/sign-in', '/server-setup'])(
  'does not interrupt an existing %s route with the mandatory picker',
  async (pathname) => {
    navigation.pathname = pathname;
    const fixture = await makeFixture([
      Struct.assign(alice, { active: Account.fields.active.make(false) }),
    ]);
    const view = await fixture.render(<PresentedMainShell />);
    expect(await screen.findByText('No active account')).toBeOnTheScreen();
    await act(async () => fixture.replace([bob]));
    expect(navigation.push).not.toHaveBeenCalled();
    navigation.pathname = '/';
    await view.rerender(<PresentedMainShell />);
    if (pipe(pathname, String.startsWith('/accounts'))) {
      expect(navigation.push).not.toHaveBeenCalled();
    } else {
      await waitFor(() => {
        expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/accounts', { withAnchor: true });
      });
    }
  }
);

it('still presents InvalidSession recovery for a selected account', async () => {
  const fixture = await makeFixture([alice]);
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
  expect(await screen.findByText('Alice')).toBeOnTheScreen();
  await waitFor(() => {
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/accounts', { withAnchor: true });
  });
});
