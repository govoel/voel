import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Cause, DateTime, Deferred, Effect, Option } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { useEffect, useImperativeHandle, useRef } from 'react';
import type { PropsWithChildren, ReactNode, Ref } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';
import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import { SelectedAccountProvider, useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import { AccountStorageKey, Account } from '#src/domains/accounts/schema.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';

import ProfileScreen from '#src/app/(app)/accounts/profile/index.android.tsx';
import type * as ProfileModel from '#src/domains/accounts/features/profile/model.ts';

const Content = vi.hoisted(() => ({ children }: PropsWithChildren) => <View>{children}</View>);
vi.mock('expo-router', () => ({
  useRouter: () => ({}),
  useFocusEffect: (effect: () => void) => {
    useEffect(effect, [effect]);
  },
}));
vi.mock(
  '#src/components/controlled-sheet',
  async () => import('#src/components/controlled-sheet/index.android.tsx')
);
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: Content,
  LazyColumn: Content,
  Icon: () => null,
  ModalBottomSheet: ({
    children,
    ref,
    showDragHandle,
  }: PropsWithChildren<{
    ref?: Ref<{ hide: () => Promise<void> }>;
    showDragHandle?: boolean;
  }>) => {
    const mountedFor = useRef(useSelectedAccount());
    useImperativeHandle(ref, () => ({ hide: async () => void 0 }));
    return (
      <View>
        <Text>
          {showDragHandle !== void 0 ? 'Main' : 'Editor'} shell mounted for{' '}
          {identity(mountedFor.current)}
        </Text>
        {children}
      </View>
    );
  },
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: () => ({}) }));
vi.mock('@expo/material-symbols/chevron_right.xml', () => ({ default: '' }));
vi.mock('#src/constants/material.ts', () => ({
  materialSeedColor: '#000000',
  useMaterialColors: () => ({ error: '#FF0000' }),
}));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/components/detail-rows', () => ({
  DetailRows: ({ details }: { details: ReadonlyArray<{ label: string; value: string }> }) => (
    <View>
      {details.map(({ label, value }) => (
        <Text key={label}>
          {label}: {value}
        </Text>
      ))}
    </View>
  ),
}));
vi.mock('#src/components/list-state', () => ({
  ListState: ({ kind, message }: { kind: string; message?: string }) => (
    <Text>{message ?? kind}</Text>
  ),
}));
vi.mock('#src/components/mutation-confirmation', () => ({ MutationConfirmation: () => null }));
vi.mock('#src/domains/accounts/components/management/session-list', () => ({ SessionList: () => null }));
vi.mock('#src/components/segmented-list/index.tsx', () => ({
  SegmentedList: Content,
  SegmentedListItem: Object.assign(
    ({ children, onClick }: PropsWithChildren<{ onClick: () => void }>) => (
      <View onTouchEnd={onClick}>{children}</View>
    ),
    { HeadlineContent: Content, TrailingContent: Content }
  ),
}));
vi.mock('#src/components/form/layout', () => ({
  FormLayout: ({ children, footer }: PropsWithChildren<{ footer: ReactNode }>) => (
    <View>
      {children}
      {footer}
    </View>
  ),
}));
vi.mock('#src/domains/accounts/features/profile/model.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof ProfileModel>();
  const { AsyncResult: Result, Atom: TestAtom } = await import('effect/reactivity');
  return {
    ...actual,
    ownSessionsAtom: TestAtom.family(() =>
      TestAtom.make(Result.success({ sessions: [], currentId: null }))
    ),
  };
});

// Only the platform input/button leaves are replaced: production form state,
// schema validation, mutation binding, and ProfileScreen's keys remain real.
const NativeTextField = ({ label }: { label: string }) => {
  const field = useFieldContext<string>();
  return (
    <TextInput
      accessibilityLabel={label}
      value={field.state.value}
      onChangeText={field.handleChange}
    />
  );
};
const SubmitProfile = () => {
  const form = useFormContext();
  return <Button title="Save changes" onPress={() => void form.handleSubmit()} />;
};

const transport = vi.hoisted(() => ({
  received: [] as Array<{
    key: AccountStorageKey;
    input: Parameters<AuthClient['Service']['updateUser']>[0];
  }>,
  completed: [] as Array<{
    key: AccountStorageKey;
    input: Parameters<AuthClient['Service']['updateUser']>[0];
  }>,
  pending: new Map<string, Deferred.Deferred<true>>(),
}));

// Keep domain schemas real, but never initialize native database/auth services.
// Form-to-client binding/lifetime only: no SQL, HTTP, persistence, or native proof.
// Query responses are controlled independently and never written by updateUser.
vi.mock('#src/database/main/index.ts', async () => {
  const { Layer } = await import('effect');
  return { MainDatabase: { layer: Layer.empty } };
});
vi.mock('#src/domains/accounts/auth-client/index.ts', async () => {
  const { Layer } = await import('effect');
  return {
    AuthClientMap: { layer: Layer.empty },
    makeAuthStorageKey: () => {
      throw new Error('Native auth storage is outside this test');
    },
  };
});
vi.mock('#src/runtime/index.ts', async () => {
  const { Layer } = await import('effect');
  const { Atom: RuntimeAtom } = await import('effect/reactivity');
  return { AppRuntime: RuntimeAtom.runtime(Layer.empty) };
});
vi.mock('#src/components/form', async () => {
  const { createEffectSchemaFormHook, fieldContext, formContext } =
    await import('#src/components/form/hooks.tsx');
  return createEffectSchemaFormHook({
    fieldComponents: {
      TextField: (props: Parameters<typeof NativeTextField>[0]) => <NativeTextField {...props} />,
    },
    formComponents: { SubmitButton: () => <SubmitProfile /> },
    fieldContext,
    formContext,
  });
});
vi.mock('#src/domains/accounts/atoms.ts', async () => {
  const source = await import('effect');
  const reactivity = await import('effect/reactivity');

  return {
    activeAccountKeyAtom: reactivity.Atom.make<
      AsyncResult.AsyncResult<Option.Option<AccountStorageKey>>
    >(reactivity.AsyncResult.initial()),
    accountAtom: reactivity.Atom.family((key: AccountStorageKey) =>
      reactivity.Atom.make<AsyncResult.AsyncResult<Option.Option<Account>>>(
        (get) => get(accountResponsesAtom).get(identity(key)) ?? reactivity.AsyncResult.initial()
      )
    ),
    accountAuthClientAtom: reactivity.Atom.family((key: AccountStorageKey) =>
      reactivity.Atom.make(
        reactivity.AsyncResult.success({
          updateUser: (input: Parameters<AuthClient['Service']['updateUser']>[0]) =>
            source.Effect.gen(function* () {
              transport.received.push({ key, input });
              const pending = transport.pending.get(identity(key));
              if (pending) {
                yield* source.Deferred.await(pending);
              }
              transport.completed.push({ key, input });
              return void 0;
            }),
        })
      )
    ),
  };
});

const accountResponsesAtom = Atom.make<
  ReadonlyMap<string, AsyncResult.AsyncResult<Option.Option<Account>>>
>(new Map());

if (
  !Atom.isWritable<Atom.Type<typeof activeAccountKeyAtom>, Atom.Type<typeof activeAccountKeyAtom>>(
    activeAccountKeyAtom
  )
) {
  throw new Error('Expected a writable selection source');
}
const selection = activeAccountKeyAtom;
const identity = (key: Pick<Account, 'serverUrl' | 'userId' | 'authStorageId'>) =>
  JSON.stringify([key.serverUrl, key.userId, key.authStorageId]);
const makeKey = ({
  server = 'https://voel.example.com',
  user = 'reader',
  storage = 'login',
} = {}) =>
  AccountStorageKey.make({
    serverUrl: Account.fields.serverUrl.make(server),
    userId: Account.fields.userId.make(user),
    authStorageId: Account.fields.authStorageId.make(storage),
  });
const makeAccount = ({ key, name }: { key: AccountStorageKey; name: string }) =>
  Account.make({
    serverUrl: key.serverUrl,
    userId: key.userId,
    authStorageId: key.authStorageId,
    name: Account.fields.name.make(name),
    username: Account.fields.username.make(name.toLowerCase()),
    email: Account.fields.email.make(`${name.toLowerCase()}@example.com`),
    role: Account.fields.role.make('user'),
    profilePicture: Account.fields.profilePicture.make(null),
    active: Account.fields.active.make(true),
    createdAt: DateTime.makeUnsafe(0),
    updatedAt: DateTime.makeUnsafe(0),
  });

const registries: Array<AtomRegistry.AtomRegistry> = [];
afterEach(() => {
  for (const registry of registries.splice(0)) {
    registry.dispose();
  }
  transport.pending.clear();
  transport.received.length = 0;
  transport.completed.length = 0;
});
const makeRegistry = ({ accounts }: { accounts: ReadonlyArray<Account> }) => {
  const registry = AtomRegistry.make();
  registries.push(registry);
  registry.set(
    accountResponsesAtom,
    new Map(accounts.map((row) => [identity(row), AsyncResult.success(Option.some(row))]))
  );
  return registry;
};
const select = async ({
  registry,
  key,
}: {
  registry: AtomRegistry.AtomRegistry;
  key: AccountStorageKey;
}) => {
  await act(() => {
    registry.set(selection, AsyncResult.success(Option.some(key)));
  });
};

// Production screen, schema and mutation; only queries and the client boundary
// are controlled. Native host markers observe ownership, not animations.
const showProfile = async ({
  registry,
  key,
}: {
  registry: AtomRegistry.AtomRegistry;
  key: AccountStorageKey;
}) => {
  registry.set(selection, AsyncResult.success(Option.some(key)));
  await render(
    <RegistryContext.Provider value={registry}>
      <SelectedAccountProvider value={key}>
        <ProfileScreen />
      </SelectedAccountProvider>
    </RegistryContext.Provider>
  );
};
const openEditor = async () => fireEvent(screen.getByText('Edit profile'), 'touchEnd');

it.each([
  { dimension: 'storage', storage: 'replacement' },
  { dimension: 'server', server: 'https://other.example.com' },
  { dimension: 'user', user: 'other-reader' },
])(
  'closes the editor on a $dimension change and reopens with pristine defaults',
  async (variant) => {
    const a = makeKey();
    const b = makeKey(variant);
    const registry = makeRegistry({
      accounts: [makeAccount({ key: a, name: 'Alice' }), makeAccount({ key: b, name: 'Bob' })],
    });
    await showProfile({ registry, key: a });
    await openEditor();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Private A draft');
    await select({ registry, key: b });
    expect(screen.getByText('Name: Bob')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).toBeNull();
    await openEditor();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Bob');
    expect(screen.getByLabelText('Username')).toHaveDisplayValue('bob');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Private B draft');
    await select({ registry, key: a });
    expect(screen.getByText('Name: Alice')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).toBeNull();
    await openEditor();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Alice');
  }
);

it('keeps the outer presentation mounted independently of editor disposal', async () => {
  const a = makeKey();
  const b = makeKey({ storage: 'B' });
  const registry = makeRegistry({
    accounts: [makeAccount({ key: a, name: 'Alice' }), makeAccount({ key: b, name: 'Bob' })],
  });
  await showProfile({ registry, key: a });
  await openEditor();
  await select({ registry, key: b });
  expect(screen.getByText('Name: Bob')).toBeOnTheScreen();
  expect(screen.getByText(`Main shell mounted for ${identity(a)}`)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Name')).toBeNull();
  await openEditor();
  expect(screen.getByText(`Editor shell mounted for ${identity(b)}`)).toBeOnTheScreen();
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Bob');
});

it('preserves an open draft through successful same-identity metadata refresh', async () => {
  const a = makeKey();
  const registry = makeRegistry({ accounts: [makeAccount({ key: a, name: 'Alice' })] });
  await showProfile({ registry, key: a });
  await openEditor();
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Private draft');
  await act(() => {
    registry.set(
      accountResponsesAtom,
      new Map([
        [
          identity(a),
          AsyncResult.success(Option.some(makeAccount({ key: a, name: 'Alice refreshed' }))),
        ],
      ])
    );
  });
  expect(screen.getByText('Name: Alice refreshed')).toBeOnTheScreen();
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Private draft');
});

it.each([
  {
    unavailable: 'loading',
    response: AsyncResult.initial<Option.Option<Account>>(true),
    message: 'loading',
  },
  {
    unavailable: 'failure',
    response: AsyncResult.failure<Option.Option<Account>>(Cause.die(new Error('Unavailable'))),
    message: 'Unable to load your profile.',
  },
  {
    unavailable: 'missing',
    response: AsyncResult.success(Option.none<Account>()),
    message: 'No active user.',
  },
])(
  'disposes an unavailable $unavailable profile editor and recovers on the base page',
  async ({ response, message }) => {
    const a = makeKey();
    const registry = makeRegistry({ accounts: [makeAccount({ key: a, name: 'Alice' })] });
    await showProfile({ registry, key: a });
    await openEditor();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Discard this draft');
    await act(() => {
      registry.set(accountResponsesAtom, new Map([[identity(a), response]]));
    });
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).toBeNull();
    await act(() => {
      registry.set(
        accountResponsesAtom,
        new Map([
          [
            identity(a),
            AsyncResult.success(Option.some(makeAccount({ key: a, name: 'Recovered' }))),
          ],
        ])
      );
    });
    expect(screen.getByText('Name: Recovered')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).toBeNull();
    await openEditor();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Recovered');
  }
);

it.each([
  {
    dimension: 'storage',
    storage: 'B',
    expectedB: { serverUrl: 'https://voel.example.com', userId: 'reader', authStorageId: 'B' },
  },
  {
    dimension: 'server',
    server: 'https://other.example.com',
    expectedB: { serverUrl: 'https://other.example.com', userId: 'reader', authStorageId: 'login' },
  },
  {
    dimension: 'user',
    user: 'other-reader',
    expectedB: {
      serverUrl: 'https://voel.example.com',
      userId: 'other-reader',
      authStorageId: 'login',
    },
  },
])(
  'binds writes across $dimension changes without letting old A completion close fresh A',
  async (variant) => {
    const a = makeKey();
    const b = makeKey(variant);
    const registry = makeRegistry({
      accounts: [makeAccount({ key: a, name: 'Alice' }), makeAccount({ key: b, name: 'Bob' })],
    });
    const pending = Deferred.makeUnsafe<true>();
    transport.pending.set(identity(a), pending);
    await showProfile({ registry, key: a });
    await openEditor();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Alice saved');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    const oldWrite = {
      key: { serverUrl: 'https://voel.example.com', userId: 'reader', authStorageId: 'login' },
      input: { name: 'Alice saved', username: 'alice' },
    };
    await waitFor(() => {
      expect(transport.received).toEqual([oldWrite]);
    });
    await select({ registry, key: b });
    await openEditor();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Bob saved');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    const bWrite = {
      key: variant.expectedB,
      input: { name: 'Bob saved', username: 'bob' },
    };
    await waitFor(() => {
      expect(transport.completed).toEqual([bWrite]);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).toBeNull();
    });
    await select({ registry, key: makeKey() });
    await openEditor();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Alice');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Fresh A draft');
    await act(() => {
      Effect.runSync(Deferred.succeed(pending, true));
    });
    await waitFor(() => {
      expect(transport.completed).toEqual([bWrite, oldWrite]);
    });
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Fresh A draft');
    expect(screen.getByText('Name: Alice')).toBeOnTheScreen();
    transport.pending.delete(identity(a));
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(transport.completed).toEqual([
        bWrite,
        oldWrite,
        {
          key: oldWrite.key,
          input: { name: 'Fresh A draft', username: 'alice' },
        },
      ]);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).toBeNull();
    });
    expect(screen.getByText('Name: Alice')).toBeOnTheScreen();
  }
);

const ScopeProbe = () => <Text testID="scoped-key">{identity(useSelectedAccount())}</Text>;
const RootSelectionProbe = () => {
  const result = useAtomValue(activeAccountKeyAtom);
  return (
    <Text testID="root-selection">
      {AsyncResult.match(result, {
        onInitial: () => 'Loading',
        onFailure: () => 'Failure',
        onSuccess: ({ value }) =>
          Option.match(value, {
            onNone: () => 'None',
            onSome: identity,
          }),
      })}
    </Text>
  );
};

it.each(['None', 'Failure'] as const)(
  'retains the last concrete B key locally on %s without rewriting the root source',
  async (exit) => {
    const a = makeKey();
    const b = makeKey({ user: 'other-reader' });
    const registry = makeRegistry({ accounts: [] });
    registry.set(selection, AsyncResult.success(Option.some(a)));
    await render(
      <RegistryContext.Provider value={registry}>
        <RootSelectionProbe />
        {/* Deliberately keep the scope alive: admission, not this accessor, owns exit. */}
        <SelectedAccountProvider value={a}>
          <ScopeProbe />
        </SelectedAccountProvider>
      </RegistryContext.Provider>
    );
    expect(screen.getByTestId('scoped-key')).toHaveTextContent(identity(a));
    await select({ registry, key: b });
    expect(screen.getByTestId('scoped-key')).toHaveTextContent(identity(b));
    const result =
      exit === 'None'
        ? AsyncResult.success(Option.none<AccountStorageKey>())
        : AsyncResult.failure<Option.Option<AccountStorageKey>>(
            Cause.die(new Error('Selection unavailable'))
          );
    await act(() => {
      registry.set(selection, result);
    });
    expect(registry.get(selection)).toBe(result);
    expect(screen.getByTestId('root-selection')).toHaveTextContent(exit);
    expect(screen.getByTestId('scoped-key')).toHaveTextContent(identity(b));
  }
);
