import { RegistryContext } from '@effect/atom-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DateTime, Deferred, Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { createContext, useContext, useEffect } from 'react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { Button, Text, View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthAdminUserDetails, AuthDeviceSession } from '@repo/auth-api/shared.ts';
import type { ConfirmationComponent } from '#src/components/mutation-confirmation/confirmation';
import { AccountStorageKey, Account } from '#src/domains/accounts/schema.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';


import AndroidProfile from '#src/app/(app)/accounts/profile/index.android.tsx';
import IOSProfile from '#src/app/(app)/accounts/profile/index.ios.tsx';
import AndroidSession from '#src/app/(app)/accounts/profile/sessions/[id]/index.android.tsx';
import IOSSession from '#src/app/(app)/accounts/profile/sessions/[id]/index.ios.tsx';
import AndroidUser from '#src/app/(app)/accounts/server/users/[id]/index.android.tsx';
import IOSUser from '#src/app/(app)/accounts/server/users/[id]/index.ios.tsx';
import type * as ProfileModel from '#src/domains/accounts/features/profile/model.ts';
import type * as UserModel from '#src/domains/accounts/features/server/users/[id]/model.ts';

const Content = vi.hoisted(() => ({ children }: PropsWithChildren) => <View>{children}</View>);
const Selection = createContext<AccountStorageKey | null>(null);
const Focused = createContext(true);
const navigation = vi.hoisted(() => ({ dismissTo: vi.fn() }));
vi.mock('expo-router', () => ({
  useRouter: () => navigation,
  useLocalSearchParams: () => ({ id: 'target' }),
  useFocusEffect: (effect: () => void) => {
    const focused = useContext(Focused);
    useEffect(() => {
      if (focused) {
        effect();
      }
    }, [effect, focused]);
  },
  Stack: { Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> } },
}));
vi.mock('#src/domains/accounts/features/selection.ts', () => ({
  useSelectedAccount: () => {
    const key = useContext(Selection);
    if (!key) {
      throw new Error('Missing test account');
    }
    return key;
  },
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: Content,
  ModalBottomSheet: Content,
  LazyColumn: Content,
  Column: Content,
  Icon: () => null,
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: () => ({}) }));
vi.mock('@expo/material-symbols/chevron_right.xml', () => ({ default: '' }));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: Content,
  Group: Content,
  List: Content,
  Section: Content,
  Button: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => (
    <View onTouchEnd={onPress}>{children}</View>
  ),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  disabled: () => ({}),
  frame: () => ({}),
  headerProminence: () => ({}),
  buttonStyle: () => ({}),
}));
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
vi.mock('#src/domains/accounts/components/management/session-list', () => ({ SessionList: () => null }));
vi.mock('#src/domains/accounts/components/management/role-field', () => ({ RoleField: () => null }));
vi.mock('#src/components/list-state', () => ({ ListState: () => <Text>Unavailable</Text> }));
vi.mock('#src/components/segmented-list/index.tsx', () => ({
  SegmentedList: Content,
  SegmentedListItem: Object.assign(
    ({ children, onClick }: PropsWithChildren<{ onClick: () => void }>) => (
      <View onTouchEnd={onClick}>{children}</View>
    ),
    { HeadlineContent: Content, TrailingContent: Content }
  ),
}));
// No editor is opened here; the shared component's native lifecycle is tested separately.
vi.mock('#src/components/controlled-sheet', () => ({ ControlledSheet: () => null }));
vi.mock('#src/components/form/layout', () => ({ FormLayout: Content }));
vi.mock('#src/components/form', async () => {
  const { createEffectSchemaFormHook, fieldContext, formContext } =
    await import('#src/components/form/hooks.tsx');
  return createEffectSchemaFormHook({
    fieldComponents: {},
    formComponents: {},
    fieldContext,
    formContext,
  });
});
// Substitute only the native confirmation view. Production MutationConfirmation
// still opens, validates/submits its form, awaits the mutation and invokes success.
vi.mock('#src/components/mutation-confirmation/confirmation', () => ({
  Confirmation: ({ trigger, title, state }: ComponentProps<ConfirmationComponent>) => (
    <View>
      {trigger}
      {state.presented ? (
        <Button title={`Confirm ${title}`} onPress={() => void state.execute()} />
      ) : null}
    </View>
  ),
}));
vi.mock('#src/database/main/index.ts', async () => {
  const { Layer } = await import('effect');
  return { MainDatabase: { layer: Layer.empty } };
});
vi.mock('#src/domains/accounts/auth-client/index.ts', async () => {
  const { Layer } = await import('effect');
  return { AuthClientMap: { layer: Layer.empty } };
});

const voidInput = void 0;
type Request = { key: AccountStorageKey } & (
  | { operation: 'revoke'; input: Parameters<AuthClient['Service']['revokeSession']>[0] }
  | { operation: 'delete'; input: Parameters<AuthClient['Service']['admin']['removeUser']>[0] }
  | { operation: 'signout'; input: typeof voidInput }
);
const transport = vi.hoisted(() => ({
  received: [] as Array<Request>,
  completed: [] as Array<Request>,
  pending: new Map<string, Deferred.Deferred<true>>(),
}));
const execute = (request: Request) =>
  Effect.gen(function* () {
    transport.received.push(request);
    const pending = transport.pending.get(request.key.authStorageId);
    if (pending) {
      yield* Deferred.await(pending);
    }
    transport.completed.push(request);
  });
vi.mock('#src/runtime/index.ts', async () => {
  const { Effect: TestEffect, Layer, Stream } = await import('effect');
  const { Atom } = await import('effect/reactivity');
  const { AccountManager } = await import('#src/domains/accounts/manager.ts');

  return {
    AppRuntime: Atom.runtime(
      Layer.succeed(AccountManager, {
        changes: Stream.empty,
        state: TestEffect.die('Outside completion test'),
        setActiveAccount: () => TestEffect.die('Outside completion test'),
        removeAccount: () => TestEffect.die('Outside completion test'),
        signInAccount: () => TestEffect.die('Outside completion test'),
        setupServerWithAccount: () => TestEffect.die('Outside completion test'),
        signOutEverywhere: (key) => execute({ operation: 'signout', key, input: void 0 }),
      })
    ),
  };
});
vi.mock('#src/domains/accounts/atoms.ts', async () => {
  const { Atom, AsyncResult } = await import('effect/reactivity');
  const { Option } = await import('effect');
  return {
    accountAtom: Atom.family((key: AccountStorageKey) =>
      Atom.make(AsyncResult.success(Option.some(makeAccount(key))))
    ),
    accountAuthClientAtom: Atom.family((key: AccountStorageKey) =>
      Atom.make(
        AsyncResult.success({
          revokeSession: (input: Parameters<AuthClient['Service']['revokeSession']>[0]) =>
            execute({ operation: 'revoke', key, input }),
          admin: {
            removeUser: (input: Parameters<AuthClient['Service']['admin']['removeUser']>[0]) =>
              execute({ operation: 'delete', key, input }),
          },
        })
      )
    ),
  };
});
vi.mock('#src/domains/accounts/features/profile/model.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof ProfileModel>();
  const { Atom, AsyncResult } = await import('effect/reactivity');
  return {
    ...actual,
    ownSessionsAtom: Atom.family((key: AccountStorageKey) =>
      Atom.make(
        AsyncResult.success({
          sessions: [makeSession(key)],
          currentId: AuthDeviceSession.fields.id.make('this-device'),
        })
      )
    ),
  };
});
vi.mock('#src/domains/accounts/features/server/users/[id]/model.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof UserModel>();
  const { Atom, AsyncResult } = await import('effect/reactivity');
  return {
    ...actual,
    serverUserAtom: Atom.family(({ account }: Parameters<typeof actual.serverUserAtom>[0]) =>
      Atom.make(
        AsyncResult.success({
          ...makeUser(account),
          isOtherUser: true,
        })
      )
    ),
    serverUserSessionsAtom: Atom.family(() => Atom.make(AsyncResult.success({ sessions: [] }))),
  };
});
const makeKey = (storage: string) =>
  AccountStorageKey.make({
    serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
    userId: Account.fields.userId.make('admin'),
    authStorageId: Account.fields.authStorageId.make(storage),
  });
const makeAccount = (key: AccountStorageKey) =>
  Account.make({
    serverUrl: key.serverUrl,
    userId: key.userId,
    authStorageId: key.authStorageId,
    name: Account.fields.name.make(`Reader ${key.authStorageId}`),
    username: Account.fields.username.make('reader'),
    email: Account.fields.email.make('reader@example.com'),
    role: Account.fields.role.make('admin'),
    profilePicture: Account.fields.profilePicture.make(null),
    active: Account.fields.active.make(true),
    createdAt: DateTime.makeUnsafe(0),
    updatedAt: DateTime.makeUnsafe(0),
  });
const makeUser = (key: AccountStorageKey) =>
  AuthAdminUserDetails.make({
    id: AuthAdminUserDetails.fields.id.make('target'),
    name: AuthAdminUserDetails.fields.name.make(`Managed ${key.authStorageId}`),
    username: AuthAdminUserDetails.fields.username.make('managed'),
    email: AuthAdminUserDetails.fields.email.make('managed@example.com'),
    role: AuthAdminUserDetails.fields.role.make('user'),
    image: AuthAdminUserDetails.fields.image.make(null),
    emailVerified: true,
    createdAt: AuthAdminUserDetails.fields.createdAt.make(DateTime.makeUnsafe(0)),
    updatedAt: AuthAdminUserDetails.fields.updatedAt.make(DateTime.makeUnsafe(0)),
  });
const makeSession = (key: AccountStorageKey) =>
  AuthDeviceSession.make({
    id: AuthDeviceSession.fields.id.make('target'),
    userId: key.userId,
    token: AuthDeviceSession.fields.token.make(`token-${key.authStorageId}`),
    ipAddress: AuthDeviceSession.fields.ipAddress.members[0].make(
      key.authStorageId === 'A' ? '10.0.0.1' : '10.0.0.2'
    ),
    userAgent: null,
    createdAt: AuthDeviceSession.fields.createdAt.make(DateTime.makeUnsafe(0)),
    updatedAt: AuthDeviceSession.fields.updatedAt.make(DateTime.makeUnsafe(0)),
    expiresAt: AuthDeviceSession.fields.expiresAt.make(DateTime.makeUnsafe(1000)),
  });
const registries: Array<AtomRegistry.AtomRegistry> = [];
afterEach(() => {
  for (const registry of registries.splice(0)) {
    registry.dispose();
  }
  transport.received.length = 0;
  transport.completed.length = 0;
  transport.pending.clear();
  navigation.dismissTo.mockClear();
});
const cases = [
  {
    name: 'Android revoke',
    Screen: AndroidSession,
    operation: 'revoke',
    action: 'Sign out',
    visible: 'IP address: 10.0.0.1',
    destination: '/accounts/profile',
    input: { token: 'token-A' },
  },
  {
    name: 'iOS revoke',
    Screen: IOSSession,
    operation: 'revoke',
    action: 'Sign out',
    visible: 'IP address: 10.0.0.1',
    destination: '/accounts/profile',
    input: { token: 'token-A' },
  },
  {
    name: 'Android delete',
    Screen: AndroidUser,
    operation: 'delete',
    action: 'Delete user',
    visible: 'Name: Managed A',
    destination: '/accounts/server/users',
    input: { userId: 'target' },
  },
  {
    name: 'iOS delete',
    Screen: IOSUser,
    operation: 'delete',
    action: 'Delete user',
    visible: 'Name: Managed A',
    destination: '/accounts/server/users',
    input: { userId: 'target' },
  },
  {
    name: 'Android signout',
    Screen: AndroidProfile,
    operation: 'signout',
    action: 'Sign out everywhere',
    visible: 'Name: Reader A',
    destination: '/accounts',
    input: void 0,
  },
  {
    name: 'iOS signout',
    Screen: IOSProfile,
    operation: 'signout',
    action: 'Sign out everywhere',
    visible: 'Name: Reader A',
    destination: '/accounts',
    input: void 0,
  },
];

// Local completion/focus ownership only: queries do not imitate mutation writes,
// and dismissTo payloads do not prove native stack/history behavior.
it.each(cases)(
  '$name ignores disposed completion and dismisses current completion when focused',
  async ({ Screen, operation, action, visible, destination, input }) => {
    const registry = AtomRegistry.make();
    registries.push(registry);
    const pending = Deferred.makeUnsafe<true>();
    transport.pending.set('A', pending);
    const keys = { A: makeKey('A'), B: makeKey('B') };
    const scene = (storage: keyof typeof keys, focused = true) => (
      <RegistryContext.Provider value={registry}>
        <Selection value={keys[storage]}>
          <Focused value={focused}>
            <Screen />
          </Focused>
        </Selection>
      </RegistryContext.Provider>
    );
    const view = await render(scene('A'));
    await fireEvent(screen.getByText(action), 'touchEnd');
    await fireEvent.press(screen.getByRole('button', { name: `Confirm ${action}` }));
    const request = {
      operation,
      key: { serverUrl: 'https://voel.example.com', userId: 'admin', authStorageId: 'A' },
      input,
    };
    await waitFor(() => {
      expect(transport.received).toEqual([request]);
    });
    await view.rerender(scene('B'));
    expect(screen.getByText(action)).toBeOnTheScreen();
    await view.rerender(scene('A'));
    await act(() => {
      Effect.runSync(Deferred.succeed(pending, true));
    });
    await waitFor(() => {
      expect(transport.completed).toEqual([request]);
    });
    expect(navigation.dismissTo.mock.calls).toEqual([]);
    expect(screen.getByText(visible)).toBeOnTheScreen();
    transport.pending.delete('A');
    await view.rerender(scene('A', false));
    await fireEvent(screen.getByText(action), 'touchEnd');
    await fireEvent.press(screen.getByRole('button', { name: `Confirm ${action}` }));
    await waitFor(() => {
      expect(transport.completed).toEqual([request, request]);
    });
    expect(navigation.dismissTo.mock.calls).toEqual([]);
    expect(screen.getByText(visible)).toBeOnTheScreen();
    await view.rerender(scene('A'));
    await waitFor(() => {
      expect(navigation.dismissTo.mock.calls).toEqual([[destination]]);
    });
  }
);
