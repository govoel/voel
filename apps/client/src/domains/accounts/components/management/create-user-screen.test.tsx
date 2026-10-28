import type { ModalBottomSheet, ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect } from 'effect';
import type { Href } from 'expo-router';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { useEffect, useImperativeHandle } from 'react';
import { Pressable, Text, View } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthUser } from '@repo/auth-api/shared.ts';

import AndroidCreateUserScreen from '#src/app/accounts/(selected)/server/users/create/index.android.tsx';
import IosCreateUserScreen from '#src/app/accounts/(selected)/server/users/create/index.ios.tsx';
import type { useCreateUserForm } from '#src/app/accounts/(selected)/server/users/create/index.ts';

const operation = vi.hoisted(() => ({
  submit: vi.fn<() => Promise<{ readonly userId: typeof AuthUser.fields.id.Type }>>(),
  delivered: vi.fn(),
}));
const native = vi.hoisted(() => ({ hide: vi.fn<() => Promise<void>>() }));
const navigation = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));

// Only the domain operation and native rendering/navigation boundaries are mocked.
vi.mock('#src/app/accounts/(selected)/server/users/create/index.ts', () => ({
  useCreateUserForm: ({ onSuccess }: Parameters<typeof useCreateUserForm>[0]) => ({
    AppForm: ({ children }: PropsWithChildren) => <View>{children}</View>,
    AppField: () => null,
    SubmitButton: ({ children }: PropsWithChildren) => (
      <Pressable
        role="button"
        onPress={() => {
          void operation.submit().then(async (result) => {
            await onSuccess(result);
            operation.delivered();
            return void 0;
          });
        }}>
        {children}
      </Pressable>
    ),
  }),
}));
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

beforeEach(() => {
  operation.submit.mockReset();
  operation.delivered.mockClear();
  native.hide.mockReset();
  navigation.replace.mockClear();
  navigation.back.mockClear();
});

describe.each([
  { platform: 'iOS', CreateUserScreen: IosCreateUserScreen },
  { platform: 'Android', CreateUserScreen: AndroidCreateUserScreen },
])('$platform create-user completion', ({ platform, CreateUserScreen }) => {
  it('does not navigate when a departed screen receives its response', async () => {
    const saved = await Effect.runPromise(
      Deferred.make<{ readonly userId: typeof AuthUser.fields.id.Type }>()
    );
    operation.submit.mockImplementation(async () => Effect.runPromise(Deferred.await(saved)));
    const view = await render(<CreateUserScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Create user/u }));
    expect(operation.submit).toHaveBeenCalledOnce();
    await view.rerender(<Text>Another screen</Text>);
    await act(async () => {
      await Effect.runPromise(
        Deferred.succeed(saved, { userId: AuthUser.fields.id.make('created-user') })
      );
    });
    await waitFor(() => {
      expect(operation.delivered).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('Another screen')).toBeOnTheScreen();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(native.hide).not.toHaveBeenCalled();
  });

  it('redirects on success, after native dismissal on Android', async () => {
    const userId = AuthUser.fields.id.make('created-user');
    const dismissed = await Effect.runPromise(Deferred.make<undefined>());
    operation.submit.mockResolvedValue({ userId });
    native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
    await render(<CreateUserScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Create user/u }));
    if (platform === 'Android') {
      await waitFor(() => {
        expect(native.hide).toHaveBeenCalledOnce();
      });
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
    expect(operation.delivered).toHaveBeenCalledOnce();
  });
});

it('does not navigate when the Android screen leaves during native dismissal', async () => {
  const dismissed = await Effect.runPromise(Deferred.make<undefined>());
  operation.submit.mockResolvedValue({ userId: AuthUser.fields.id.make('created-user') });
  native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
  const view = await render(<AndroidCreateUserScreen />);
  await fireEvent.press(screen.getByRole('button', { name: /Create user/u }));
  await waitFor(() => {
    expect(native.hide).toHaveBeenCalledOnce();
  });
  await view.rerender(<Text>Another screen</Text>);
  await act(async () => {
    await Effect.runPromise(Deferred.succeed(dismissed, void 0));
  });
  await waitFor(() => {
    expect(operation.delivered).toHaveBeenCalledOnce();
  });
  expect(screen.getByText('Another screen')).toBeOnTheScreen();
  expect(navigation.replace).not.toHaveBeenCalled();
});
