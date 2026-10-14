import { RegistryContext } from '@effect/atom-react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Cause, Option } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { useRef } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Text, View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';
import { AppAdmission } from '#src/components/app-admission/index.tsx';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';
import { Account } from '#src/domains/accounts/schema.ts';

import AppLayout from '#src/app/(app)/_layout.tsx';

const restoration = vi.hoisted(() => ({
  // UI-only restoration stays pending until the test supplies a response.
  restore: async () => Promise.withResolvers<Option.Option<AccountStorageKey>>().promise,
}));

// These tests exercise admission and scoped lifetime, not a substitute native navigator.
vi.mock('expo-router', () => ({
  useTheme: () => ({ colors: { text: '#FFFFFF', background: '#000000', primary: '#FFFFFF' } }),
  Stack: Object.assign(
    ({
      children,
      layout,
    }: PropsWithChildren<{
      layout?: (props: PropsWithChildren) => ReactNode;
    }>) => <View>{layout ? layout({ children }) : children}</View>,
    {
      Protected: ({ guard, children }: PropsWithChildren<{ guard: boolean }>) =>
        guard ? <View>{children}</View> : null,
      Screen: ({ name }: { name: string }) => <Text>{name}</Text>,
    }
  ),
}));
vi.mock('#src/domains/accounts/components/auto-presenter/index.tsx', () => ({
  AccountsAutoPresenter: () => {
    const key = useSelectedAccount();
    const mountedFor = useRef([key.serverUrl, key.userId, key.authStorageId]).current;
    return (
      <Text>{JSON.stringify([key.serverUrl, key.userId, key.authStorageId, mountedFor])}</Text>
    );
  },
}));
vi.mock('#src/domains/accounts/atoms.ts', async () => {
  const reactivity = await import('effect/reactivity');
  const { AppRuntime } = await vi.importMock<{
    AppRuntime: Atom.Atom<AsyncResult.AsyncResult<Option.Option<AccountStorageKey>>>;
  }>('#src/runtime/index.ts');
  return {
    activeAccountKeyAtom: reactivity.Atom.writable(
      (get) => get(AppRuntime),
      (context, value: AsyncResult.AsyncResult<Option.Option<AccountStorageKey>>) => {
        context.setSelf(value);
      }
    ),
  };
});
vi.mock('#src/runtime/index.ts', async () => {
  const { Effect } = await import('effect');
  const { Atom: TestAtom } = await import('effect/reactivity');
  // Only button/loading/error presentation is faked here. SQL/runtime recovery
  // is covered with the real manager and repository in accounts/atoms.test.ts.
  return { AppRuntime: TestAtom.make(Effect.tryPromise(async () => restoration.restore())) };
});

// The test implementation above is writable, while the production atom is service-owned.
if (
  !Atom.isWritable<Atom.Type<typeof activeAccountKeyAtom>, Atom.Type<typeof activeAccountKeyAtom>>(
    activeAccountKeyAtom
  )
) {
  throw new Error('Expected a writable test selection source');
}
const selection = activeAccountKeyAtom;
const registries: Array<AtomRegistry.AtomRegistry> = [];
afterEach(() => {
  for (const registry of registries.splice(0)) {
    registry.dispose();
  }
});

const makeRegistry = () => {
  const registry = AtomRegistry.make();
  registries.push(registry);
  return registry;
};
const makeKey = ({
  server = 'https://voel.example.com',
  user = 'reader',
  storage = 'login',
} = {}) => {
  const fields = {
    serverUrl: Account.fields.serverUrl.make(server),
    userId: Account.fields.userId.make(user),
    authStorageId: Account.fields.authStorageId.make(storage),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded fixture without loading native account services.
  return fields as AccountStorageKey;
};

it('keeps restoration/loading/failure separate from empty, then declares complementary protected groups', async () => {
  const registry = makeRegistry();
  await render(
    <RegistryContext.Provider value={registry}>
      <AppAdmission loading={<Text>Restoring accounts</Text>} />
    </RegistryContext.Provider>
  );
  expect(screen.getByText('Restoring accounts')).toBeTruthy();
  expect(screen.queryByText('(onboarding)')).toBeNull();
  await act(() => {
    registry.set(selection, AsyncResult.failure(Cause.die(new Error('database unavailable'))));
  });
  expect(screen.getByText('Unable to restore accounts.')).toBeTruthy();
  expect(screen.queryByText('(onboarding)')).toBeNull();
  await act(() => {
    registry.set(selection, AsyncResult.success(Option.none()));
  });
  expect(screen.getByText('(onboarding)')).toBeTruthy();
  expect(screen.queryByText('(app)')).toBeNull();
  await act(() => {
    registry.set(selection, AsyncResult.success(Option.some(makeKey())));
  });
  expect(screen.getByText('(app)')).toBeTruthy();
  expect(screen.queryByText('(onboarding)')).toBeNull();
  await act(() => {
    registry.set(
      selection,
      AsyncResult.failureWithPrevious(Cause.die(new Error('selection read failed')), {
        previous: Option.some(AsyncResult.success(Option.some(makeKey()))),
      })
    );
  });
  expect(screen.getByText('Unable to restore accounts.')).toBeTruthy();
  expect(screen.queryByText('(app)')).toBeNull();
  expect(screen.queryByText('(onboarding)')).toBeNull();
  await act(() => {
    registry.set(selection, AsyncResult.success(Option.none()));
  });
  expect(screen.getByText('(onboarding)')).toBeTruthy();
  expect(screen.queryByText('(app)')).toBeNull();
});

it('remounts concrete scope for each full identity and never renders app content after last removal', async () => {
  const registry = makeRegistry();
  registry.set(selection, AsyncResult.success(Option.some(makeKey())));
  await render(
    <RegistryContext.Provider value={registry}>
      <AppLayout />
    </RegistryContext.Provider>
  );
  for (const { key, identity } of [
    {
      key: makeKey(),
      identity: ['https://voel.example.com', 'reader', 'login'],
    },
    {
      key: makeKey({ storage: 'replacement-login' }),
      identity: ['https://voel.example.com', 'reader', 'replacement-login'],
    },
    {
      key: makeKey({ server: 'https://other.example.com', storage: 'replacement-login' }),
      identity: ['https://other.example.com', 'reader', 'replacement-login'],
    },
    {
      key: makeKey({
        server: 'https://other.example.com',
        user: 'other-reader',
        storage: 'replacement-login',
      }),
      identity: ['https://other.example.com', 'other-reader', 'replacement-login'],
    },
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- identity transitions must be observed sequentially.
    await act(() => {
      registry.set(selection, AsyncResult.success(Option.some(key)));
    });
    expect(screen.getByText(JSON.stringify([...identity, identity]))).toBeTruthy();
  }
  await act(() => {
    registry.set(selection, AsyncResult.success(Option.none()));
  });
  expect(screen.queryByText('(tabs)')).toBeNull();
  expect(screen.queryByText('accounts')).toBeNull();
});

it('offers retry, blocks admission while retrying, and permits another attempt after failure', async () => {
  const registry = makeRegistry();
  restoration.restore = async () => {
    throw new Error('database unavailable');
  };
  await render(
    <RegistryContext.Provider value={registry}>
      <AppAdmission loading={<Text>Restoring accounts</Text>} />
    </RegistryContext.Provider>
  );
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  const failure = Promise.withResolvers<Option.Option<AccountStorageKey>>();
  restoration.restore = async () => failure.promise;
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  });
  expect(screen.getByText('Restoring accounts')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(screen.queryByText('(app)')).toBeNull();
  expect(screen.queryByText('(onboarding)')).toBeNull();
  await act(() => {
    failure.reject(new Error('database still unavailable'));
  });
  expect(screen.getByText('Unable to restore accounts.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('(app)')).toBeNull();
  expect(screen.queryByText('(onboarding)')).toBeNull();

  const recovery = Promise.withResolvers<Option.Option<AccountStorageKey>>();
  restoration.restore = async () => recovery.promise;
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  });
  expect(screen.getByText('Restoring accounts')).toBeTruthy();
  await act(() => {
    recovery.resolve(Option.some(makeKey()));
  });
  expect(screen.getByText('(app)')).toBeTruthy();
  expect(screen.queryByText('(onboarding)')).toBeNull();
  expect(screen.queryByText('Unable to restore accounts.')).toBeNull();
});
