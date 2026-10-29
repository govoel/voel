import { RegistryContext } from '@effect/atom-react';
import type { ModalBottomSheet, ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Option } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { Href } from 'expo-router';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { useEffect, useImperativeHandle } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthUser } from '@repo/auth-api/shared.ts';

import AndroidCreateUserScreen from '#src/app/accounts/(selected)/server/users/create/index.android.tsx';
import IosCreateUserScreen from '#src/app/accounts/(selected)/server/users/create/index.ios.tsx';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';

const native = vi.hoisted(() => ({ hide: vi.fn<() => Promise<void>>() }));
const navigation = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));

// Keep the screen, validation, mutation and auth client real. Substitute native
// controls, navigation and credential storage; requests stop at fetch.
vi.mock('#src/runtime/index.ts', async () => {
  const { Effect: effect, Layer } = await import('effect');
  const { Atom, Reactivity } = await import('effect/reactivity');
  const { AuthClientMap } = await import('#src/domains/accounts/auth-client/index.ts');
  const { AccountRepository } = await import('#src/domains/accounts/repository.ts');
  return {
    AppRuntime: Atom.runtime(
      AuthClientMap.layerNoDeps.pipe(
        Layer.provide([
          Reactivity.layer,
          Layer.mock(AccountRepository, {
            list: effect.succeed([]),
            getActiveKey: effect.succeedNone,
            readAuthStorage: () => effect.succeed({}),
            writeAuthStorageItem: () => effect.void,
            findByKey: () => effect.succeedNone,
          }),
        ])
      )
    ),
  };
});
vi.mock('#src/components/form', async () => {
  const { createEffectSchemaFormHook, fieldContext, formContext, useFieldContext, useSubmitState } =
    await import('#src/components/form/hooks.tsx');
  const TextField = ({ label }: { readonly label: string }) => {
    const field = useFieldContext<string>();
    return (
      <TextInput
        accessibilityLabel={label}
        value={field.state.value}
        onChangeText={field.handleChange}
      />
    );
  };
  const SubmitButton = ({ children }: PropsWithChildren) => {
    const { form, canSubmit, isSubmitting, errorMessage } = useSubmitState();
    return (
      <Pressable
        role="button"
        disabled={!canSubmit || isSubmitting}
        onPress={() => void form.handleSubmit()}>
        {children}
        {isSubmitting ? <Text>Saving</Text> : null}
        {Option.match(errorMessage, {
          onNone: () => null,
          onSome: (message) => <Text>{message}</Text>,
        })}
      </Pressable>
    );
  };
  return createEffectSchemaFormHook({
    fieldContext,
    formContext,
    fieldComponents: { TextField, SecureField: TextField },
    formComponents: { SubmitButton },
  });
});
vi.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'Test phone' }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `voel://${path}` }));
vi.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => void 0 }) }));
vi.mock('expo-router', () => ({
  Stack: { Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> } },
  useRouter: () => navigation,
  Redirect: ({ href }: { readonly href: Href }) => {
    useEffect(() => {
      navigation.replace(href);
    }, [href]);
    return null;
  },
}));
vi.mock('#src/components/form/layout', () => ({
  FormLayout: ({
    children,
    footer,
    title,
  }: PropsWithChildren<{ readonly footer: ReactNode; readonly title?: string }>) => (
    <View>
      <Text>{title}</Text>
      {children}
      {footer}
    </View>
  ),
}));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/domains/accounts/components/management/role-field', () => ({
  RoleField: () => null,
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: PropsWithChildren) => <View>{children}</View>,
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({ buttonStyle: () => ({}), frame: () => ({}) }));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: () => ({}) }));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: PropsWithChildren) => <View>{children}</View>,
  ModalBottomSheet: ({
    children,
    ref,
    onDismissRequest,
  }: Pick<ComponentProps<typeof ModalBottomSheet>, 'children' | 'ref' | 'onDismissRequest'>) => {
    useImperativeHandle(
      ref,
      () =>
        ({
          hide: native.hide,
          expand: async () => void 0,
          partialExpand: async () => void 0,
        }) satisfies ModalBottomSheetRef
    );
    return (
      <View>
        {children}
        <Pressable onPress={onDismissRequest}>
          <Text>Swipe away</Text>
        </Pressable>
      </View>
    );
  },
}));

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://example.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
const userId = AuthUser.fields.id.make('created-user');
const createdUserResponse = () =>
  Response.json({
    user: {
      id: userId,
      name: 'Someone Else',
      username: 'someoneElse',
      email: 'someone@else.com',
      role: 'under18',
      image: null,
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    },
  });
const mockCreateUserRequest = ({
  respond,
}: {
  readonly respond: () => Response | Promise<Response>;
}) => {
  const request = vi.fn(respond);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    new URL(input instanceof Request ? input.url : input).pathname === '/api/auth/admin/create-user'
      ? request()
      : Response.json(null)
  );
  return request;
};
const registries = new Set<AtomRegistry.AtomRegistry>();
const renderScreen = async ({ Screen }: { readonly Screen: typeof IosCreateUserScreen }) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  return render(<Screen />, {
    wrapper: ({ children }: PropsWithChildren) => (
      <RegistryContext.Provider value={registry}>
        <SelectedAccountContext.Provider value={account}>
          {children}
        </SelectedAccountContext.Provider>
      </RegistryContext.Provider>
    ),
  });
};
const submitUser = async () => {
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Someone Else');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'someoneElse');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'someone@else.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-password');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'a-password');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Create user/u })).toBeEnabled();
  });
  await fireEvent.press(screen.getByRole('button', { name: /Create user/u }));
};

beforeEach(() => {
  native.hide.mockReset();
  navigation.replace.mockClear();
  navigation.back.mockClear();
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
  vi.restoreAllMocks();
});

describe.each([
  { platform: 'iOS', CreateUserScreen: IosCreateUserScreen },
  { platform: 'Android', CreateUserScreen: AndroidCreateUserScreen },
])('$platform create-user completion', ({ platform, CreateUserScreen }) => {
  it('preserves the next screen when a departed screen receives its response', async () => {
    const saved = await Effect.runPromise(Deferred.make<Response>());
    const request = mockCreateUserRequest({
      respond: async () => Effect.runPromise(Deferred.await(saved)),
    });
    const view = await renderScreen({ Screen: CreateUserScreen });
    await submitUser();
    await waitFor(() => {
      expect(request).toHaveBeenCalled();
    });
    await view.rerender(<Text>Another screen</Text>);
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(saved, createdUserResponse()));
    });
    expect(screen.getByText('Another screen')).toBeOnTheScreen();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it('opens the created user, waiting for native dismissal on Android', async () => {
    const dismissed = await Effect.runPromise(Deferred.make<undefined>());
    mockCreateUserRequest({ respond: createdUserResponse });
    native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
    await renderScreen({ Screen: CreateUserScreen });
    await submitUser();
    if (platform === 'Android') {
      await waitFor(() => {
        expect(native.hide).toHaveBeenCalled();
      });
      expect(screen.getByText('Saving')).toBeOnTheScreen();
      expect(navigation.replace).not.toHaveBeenCalled();
      await act(async () => {
        await Effect.runPromise(Deferred.succeed(dismissed, void 0));
      });
    }
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith({
        pathname: '/accounts/server/users/[id]',
        params: { id: userId },
      });
    });
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});

it('preserves the next screen when Android finishes dismissing the departed screen', async () => {
  const dismissed = await Effect.runPromise(Deferred.make<undefined>());
  mockCreateUserRequest({ respond: createdUserResponse });
  native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
  const view = await renderScreen({ Screen: AndroidCreateUserScreen });
  await submitUser();
  await waitFor(() => {
    expect(native.hide).toHaveBeenCalled();
  });
  await view.rerender(<Text>Another screen</Text>);
  await act(async () => {
    await Effect.runPromise(Deferred.succeed(dismissed, void 0));
  });
  expect(screen.getByText('Another screen')).toBeOnTheScreen();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.back).not.toHaveBeenCalled();
});
