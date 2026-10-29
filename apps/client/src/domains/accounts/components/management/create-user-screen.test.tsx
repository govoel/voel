import { RegistryContext } from '@effect/atom-react';
import type { ModalBottomSheet, ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Option } from 'effect';
import { AtomRegistry, Reactivity } from 'effect/reactivity';
import type { Redirect as ExpoRedirect } from 'expo-router/build/link/Redirect';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { useImperativeHandle } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthUser } from '@repo/auth-api/shared.ts';

import AndroidCreateUserScreen from '#src/app/accounts/(selected)/server/users/create/index.android.tsx';
import IosCreateUserScreen from '#src/app/accounts/(selected)/server/users/create/index.ios.tsx';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const native = vi.hoisted(() => ({ hide: vi.fn<() => Promise<void>>() }));
const navigation = vi.hoisted(() => {
  let focused = true;
  const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
  return {
    replace: vi.fn(),
    back: vi.fn(),
    isFocused: () => focused,
    addListener: (event: keyof typeof listeners, listener: () => void) => {
      listeners[event].add(listener);
      return () => {
        listeners[event].delete(listener);
      };
    },
    setFocused: (value: boolean) => {
      focused = value;
      for (const listener of listeners[value ? 'focus' : 'blur']) {
        listener();
      }
    },
  };
});

// Keep the screen, validation, mutation and auth client real. Substitute native
// controls, navigation and credential storage; requests stop at fetch.
vi.mock('#src/runtime/index.ts', async () => {
  const { Effect: effect, Layer } = await import('effect');
  const { Atom, Reactivity: reactivity } = await import('effect/reactivity');
  const { AuthClientMap } = await import('#src/domains/accounts/auth-client/index.ts');
  const { AccountRepository } = await import('#src/domains/accounts/repository.ts');
  return {
    AppRuntime: Atom.runtime(
      AuthClientMap.layerNoDeps.pipe(
        Layer.provide([
          reactivity.layer,
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
  const { AppRuntime: runtime } = await import('#src/runtime/index.ts');
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
    runtime,
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
// Exercise Expo's real Redirect and focus effect; only the navigation driver is fake.
vi.mock('expo-router/build/hooks/useRouter', () => ({ useRouter: () => navigation }));
vi.mock('expo-router/build/useNavigation', () => ({ useNavigation: () => navigation }));
vi.mock('expo-router/build/link/useLoadedNavigation', () => ({
  useOptionalNavigation: () => navigation,
}));
vi.mock('expo-router', async () => ({
  Stack: { Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> } },
  useRouter: () => navigation,
  ...(await vi.importActual<{ Redirect: typeof ExpoRedirect }>('expo-router/build/link/Redirect')),
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
const createdUserResponse = ({ id = userId }: { readonly id?: typeof userId } = {}) =>
  Response.json({
    user: {
      id,
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
const cleanups = new Set<() => void>();
const renderScreen = async ({ Screen }: { readonly Screen: typeof IosCreateUserScreen }) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  const view = await render(<Screen />, {
    wrapper: ({ children }: PropsWithChildren) => (
      <RegistryContext.Provider value={registry}>
        <SelectedAccountContext.Provider value={account}>
          {children}
        </SelectedAccountContext.Provider>
      </RegistryContext.Provider>
    ),
  });
  return { ...view, registry };
};
const submitUser = async ({ username = 'someoneElse' }: { readonly username?: string } = {}) => {
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Someone Else');
  await fireEvent.changeText(screen.getByLabelText('Username'), username);
  await fireEvent.changeText(screen.getByLabelText('Email'), `${username}@example.test`);
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-password');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'a-password');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Create user/u })).toBeEnabled();
  });
  await fireEvent.press(screen.getByRole('button', { name: /Create user/u }));
};

beforeEach(() => {
  navigation.setFocused(true);
  native.hide.mockReset();
  navigation.replace.mockClear();
  navigation.back.mockClear();
});
afterEach(() => {
  for (const cleanup of cleanups) {
    cleanup();
  }
  cleanups.clear();
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
  it('finishes a departed form independently while a reopened form is saving', async () => {
    const firstSaved = await Effect.runPromise(Deferred.make<Response>());
    const secondSaved = await Effect.runPromise(Deferred.make<Response>());
    const secondUserId = AuthUser.fields.id.make('second-created-user');
    const request = mockCreateUserRequest({
      respond: async () => Effect.runPromise(Deferred.await(firstSaved)),
    });
    request
      .mockImplementationOnce(async () => Effect.runPromise(Deferred.await(firstSaved)))
      .mockImplementationOnce(async () => Effect.runPromise(Deferred.await(secondSaved)));
    native.hide.mockResolvedValue();
    const view = await renderScreen({ Screen: CreateUserScreen });
    const reactivity = await Effect.runPromise(
      AtomRegistry.getResult(view.registry, AppRuntime.atom(Reactivity.Reactivity))
    );
    const invalidated = vi.fn<() => void>();
    cleanups.add(reactivity.registerUnsafe(['auth.users'], invalidated));

    await submitUser({ username: 'firstUser' });
    await waitFor(() => {
      expect(request).toHaveBeenCalledOnce();
    });
    await view.rerender(<CreateUserScreen key="reopened" />);
    await submitUser({ username: 'secondUser' });
    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      await Effect.runPromise(Deferred.succeed(firstSaved, createdUserResponse()));
    });
    await waitFor(() => {
      expect(invalidated).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('Saving')).toBeOnTheScreen();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(native.hide).not.toHaveBeenCalled();

    await act(async () => {
      await Effect.runPromise(
        Deferred.succeed(secondSaved, createdUserResponse({ id: secondUserId }))
      );
    });
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
        { pathname: '/accounts/server/users/[id]', params: { id: secondUserId } },
        { relativeToDirectory: void 0, withAnchor: void 0 }
      );
    });
    expect(invalidated).toHaveBeenCalledTimes(2);
  });

  it('waits for focus before navigating from a completed, still-mounted screen', async () => {
    const saved = await Effect.runPromise(Deferred.make<Response>());
    const request = mockCreateUserRequest({
      respond: async () => Effect.runPromise(Deferred.await(saved)),
    });
    native.hide.mockResolvedValue();
    await renderScreen({ Screen: CreateUserScreen });
    await submitUser();
    await waitFor(() => {
      expect(request).toHaveBeenCalledOnce();
    });
    await act(() => {
      navigation.setFocused(false);
    });
    expect(screen.getByLabelText('Name')).toBeOnTheScreen();

    await act(async () => {
      await Effect.runPromise(Deferred.succeed(saved, createdUserResponse()));
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).toBeNull();
    });
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.back).not.toHaveBeenCalled();

    await act(() => {
      navigation.setFocused(true);
    });
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
      { pathname: '/accounts/server/users/[id]', params: { id: userId } },
      { relativeToDirectory: void 0, withAnchor: void 0 }
    );
  });

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
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
        { pathname: '/accounts/server/users/[id]', params: { id: userId } },
        { relativeToDirectory: void 0, withAnchor: void 0 }
      );
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
