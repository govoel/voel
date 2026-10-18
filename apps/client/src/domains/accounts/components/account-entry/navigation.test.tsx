import { renderHook } from '@testing-library/react-native';
import { beforeEach, expect, it, vi } from 'vitest';

import { useCompleteAccountEntry } from '#src/domains/accounts/components/account-entry/navigation.ts';

const navigation = vi.hoisted(() => ({
  focused: true,
  returnTo: '/',
  router: { dismissTo: vi.fn() },
}));

vi.mock('expo-router', () => ({
  useRouter: () => navigation.router,
  useNavigation: () => ({ isFocused: () => navigation.focused }),
  useLocalSearchParams: () => ({ returnTo: navigation.returnTo }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.focused = true;
  navigation.returnTo = '/';
});

it.each(['/', '/accounts'])(
  'dismisses to the caller destination %s without inspecting account state',
  async (returnTo) => {
    navigation.returnTo = returnTo;
    const hook = await renderHook(useCompleteAccountEntry);
    await hook.result.current();
    expect(navigation.router.dismissTo).toHaveBeenCalledExactlyOnceWith(returnTo);
  }
);

it('only accepts supported return destinations from deep links', async () => {
  navigation.returnTo = 'https://example.com';
  const hook = await renderHook(useCompleteAccountEntry);
  await hook.result.current();
  expect(navigation.router.dismissTo).toHaveBeenCalledExactlyOnceWith('/');
});

it('waits for the native sheet to hide before removing its route', async () => {
  const hidden = Promise.withResolvers<undefined>();
  const hook = await renderHook(() =>
    useCompleteAccountEntry({ beforeDismiss: async () => hidden.promise })
  );
  const completion = hook.result.current();
  expect(navigation.router.dismissTo).not.toHaveBeenCalled();
  hidden.resolve(void 0);
  await completion;
  expect(navigation.router.dismissTo).toHaveBeenCalledExactlyOnceWith('/');
});

it('does not navigate after the form loses focus while hiding', async () => {
  const hidden = Promise.withResolvers<undefined>();
  const hook = await renderHook(() =>
    useCompleteAccountEntry({ beforeDismiss: async () => hidden.promise })
  );
  const completion = hook.result.current();
  navigation.focused = false;
  hidden.resolve(void 0);
  await completion;
  expect(navigation.router.dismissTo).not.toHaveBeenCalled();
});

it('does not hide or navigate when a dismissed form finishes authenticating', async () => {
  const beforeDismiss = vi.fn(async () => void 0);
  const hook = await renderHook(() => useCompleteAccountEntry({ beforeDismiss }));
  navigation.focused = false;
  await hook.result.current();
  expect(beforeDismiss).not.toHaveBeenCalled();
  expect(navigation.router.dismissTo).not.toHaveBeenCalled();
});
