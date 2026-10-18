import { RegistryContext } from '@effect/atom-react';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { DateTime, Deferred, Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { createContext, useContext } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import { AuthUser } from '@repo/auth-api/shared.ts';

import AndroidCreate from '#src/app/(app)/accounts/server/users/create/index.android.tsx';
import IOSCreate from '#src/app/(app)/accounts/server/users/create/index.ios.tsx';
import { useFieldContext, useSubmitState } from '#src/components/form/hooks.tsx';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { Account, AccountStorageKey } from '#src/domains/accounts/schema.ts';

const Content = vi.hoisted(() => ({ children }: PropsWithChildren) => <View>{children}</View>);
const Selection = createContext<AccountStorageKey | null>(null);
vi.mock('#src/domains/accounts/features/selection.ts', () => ({
  useSelectedAccount: () => {
    const key = useContext(Selection);
    if (!key) {
      throw new Error('Missing test account');
    }
    return key;
  },
}));
// Redirect is rendered by production local completion. This records its actual
// destination, not a manually invoked success callback or a native router stack.
vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => <Text testID="redirect">{JSON.stringify(href)}</Text>,
  useRouter: () => ({}),
  Stack: { Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> } },
}));
vi.mock('@expo/ui/jetpack-compose', () => ({ Host: Content, ModalBottomSheet: Content }));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: () => ({}) }));
vi.mock('@expo/ui/swift-ui', () => ({ Host: Content }));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({ buttonStyle: () => ({}), frame: () => ({}) }));
vi.mock('#src/constants/material.ts', () => ({ materialSeedColor: '#000000' }));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/components/form/layout', () => ({
  FormLayout: ({ children, footer }: PropsWithChildren<{ footer: ReactNode }>) => (
    <View>
      {children}
      {footer}
    </View>
  ),
}));
vi.mock('#src/domains/accounts/components/management/role-field', () => ({
  RoleField: () => <Text>Under 18</Text>,
}));

const NativeField = ({ label }: { label: string }) => {
  const field = useFieldContext<string>();
  return (
    <TextInput
      accessibilityLabel={label}
      value={field.state.value}
      onChangeText={field.handleChange}
    />
  );
};
const Submit = () => {
  const { form, canSubmit, isSubmitting } = useSubmitState();
  return (
    <Button
      title="Create user"
      disabled={!canSubmit || isSubmitting}
      onPress={() => void form.handleSubmit()}
    />
  );
};
vi.mock('#src/components/form', async () => {
  const { createEffectSchemaFormHook, fieldContext, formContext } =
    await import('#src/components/form/hooks.tsx');
  return createEffectSchemaFormHook({
    fieldComponents: {
      TextField: (props: Parameters<typeof NativeField>[0]) => <NativeField {...props} />,
      SecureField: (props: Parameters<typeof NativeField>[0]) => <NativeField {...props} />,
    },
    formComponents: { SubmitButton: () => <Submit /> },
    fieldContext,
    formContext,
  });
});
vi.mock('#src/database/main/index.ts', async () => {
  const { Layer } = await import('effect');
  return { MainDatabase: { layer: Layer.empty } };
});
vi.mock('#src/domains/accounts/auth-client/index.ts', async () => {
  const { Layer } = await import('effect');
  return { AuthClientMap: { layer: Layer.empty } };
});
vi.mock('#src/runtime/index.ts', async () => {
  const { Layer } = await import('effect');
  const { Atom: RuntimeAtom } = await import('effect/reactivity');
  return { AppRuntime: RuntimeAtom.runtime(Layer.empty) };
});
const transport = vi.hoisted(() => ({
  received: [] as Array<{
    key: AccountStorageKey;
    input: Parameters<AuthClient['Service']['admin']['createUser']>[0];
  }>,
  completed: [] as Array<string>,
  pending: new Map<string, Deferred.Deferred<true>>(),
}));
vi.mock('#src/domains/accounts/atoms.ts', async () => {
  const { Atom, AsyncResult } = await import('effect/reactivity');
  return {
    accountAuthClientAtom: Atom.family((key: AccountStorageKey) =>
      Atom.make(
        AsyncResult.success({
          admin: {
            createUser: (input: Parameters<AuthClient['Service']['admin']['createUser']>[0]) =>
              Effect.gen(function* () {
                transport.received.push({ key, input });
                const pending = transport.pending.get(key.authStorageId);
                if (pending) {
                  yield* Deferred.await(pending);
                }
                transport.completed.push(input.username);
                return {
                  user: AuthUser.make({
                    id: AuthUser.fields.id.make(`created-${input.username}`),
                    name: AuthUser.fields.name.make(input.name),
                    username: AuthUser.fields.username.make(input.username),
                    email: AuthUser.fields.email.make(input.email),
                    role: input.role,
                    image: AuthUser.fields.image.make(null),
                    createdAt: AuthUser.fields.createdAt.make(DateTime.makeUnsafe(0)),
                    updatedAt: AuthUser.fields.updatedAt.make(DateTime.makeUnsafe(0)),
                  }),
                };
              }),
          },
        })
      )
    ),
  };
});
const makeKey = (storage: string) =>
  AccountStorageKey.make({
    serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
    userId: Account.fields.userId.make('admin'),
    authStorageId: Account.fields.authStorageId.make(storage),
  });
const registries: Array<AtomRegistry.AtomRegistry> = [];
afterEach(() => {
  for (const registry of registries.splice(0)) {
    registry.dispose();
  }
  transport.received.length = 0;
  transport.completed.length = 0;
  transport.pending.clear();
});
const fillUser = async (username: string) => {
  await fireEvent.changeText(screen.getByLabelText('Name'), `${username} name`);
  await fireEvent.changeText(screen.getByLabelText('Username'), username);
  await fireEvent.changeText(screen.getByLabelText('Email'), `${username}@example.com`);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Password'), 'password-123');
  await user.type(screen.getByLabelText('Confirm password'), 'password-123');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Create user' })).toBeEnabled();
  });
};

// Real screens/form/schema/mutation, substituted client Effects and platform leaves.
// No HTTP, persistence, native animation, or router-history claim.
it.each([
  { platform: 'Android', Screen: AndroidCreate },
  { platform: 'iOS', Screen: IOSCreate },
])(
  '$platform create ignores disposed A completion after A → B → fresh A and redirects for current submission',
  async ({ Screen }) => {
    const registry = AtomRegistry.make();
    registries.push(registry);
    const a = makeKey('A');
    const pending = Deferred.makeUnsafe<true>();
    transport.pending.set('A', pending);
    const scene = (key: AccountStorageKey) => (
      <RegistryContext.Provider value={registry}>
        <Selection value={key}>
          <Screen />
        </Selection>
      </RegistryContext.Provider>
    );
    const view = await render(scene(a));
    await fillUser('old-alice');
    await fireEvent.press(screen.getByRole('button', { name: 'Create user' }));
    await waitFor(() => {
      expect(transport.received).toEqual([
        {
          key: { serverUrl: 'https://voel.example.com', userId: 'admin', authStorageId: 'A' },
          input: {
            name: 'old-alice name',
            username: 'old-alice',
            email: 'old-alice@example.com',
            password: 'password-123',
            role: 'under18',
          },
        },
      ]);
    });
    await view.rerender(scene(makeKey('B')));
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'B draft');
    await view.rerender(scene(makeKey('A')));
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Password')).toHaveDisplayValue('');
    await fillUser('fresh-alice');
    await act(() => {
      Effect.runSync(Deferred.succeed(pending, true));
    });
    await waitFor(() => {
      expect(transport.completed).toEqual(['old-alice']);
    });
    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('fresh-alice name');
    transport.pending.delete('A');
    await fireEvent.press(screen.getByRole('button', { name: 'Create user' }));
    await waitFor(() => {
      expect(screen.getByTestId('redirect')).toHaveTextContent(
        '{"pathname":"/accounts/server/users/[id]","params":{"id":"created-fresh-alice"}}'
      );
    });
    expect(transport.completed).toEqual(['old-alice', 'fresh-alice']);
    expect(transport.received[1]).toEqual({
      key: { serverUrl: 'https://voel.example.com', userId: 'admin', authStorageId: 'A' },
      input: {
        name: 'fresh-alice name',
        username: 'fresh-alice',
        email: 'fresh-alice@example.com',
        password: 'password-123',
        role: 'under18',
      },
    });
  }
);
