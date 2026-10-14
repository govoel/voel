import { RegistryContext } from '@effect/atom-react';
import { act, render } from '@testing-library/react-native';
import { Cause, Option } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountsAutoPresenter } from '#src/domains/accounts/components/auto-presenter/index.tsx';
import { accountsSheetAtom } from '#src/domains/accounts/components/auto-presenter/model.ts';
import type { AccountsSheet } from '#src/domains/accounts/components/auto-presenter/model.ts';


const navigation = vi.hoisted(() => ({ pathname: '/', router: { push: vi.fn() } }));
vi.mock('expo-router', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));
vi.mock('#src/domains/accounts/components/auto-presenter/model.ts', async () => {
  const reactivity = await import('effect/reactivity');
  return {
    accountsSheetAtom: reactivity.Atom.make(reactivity.AsyncResult.initial()),
    accountsSheetIsInvalidSession: (sheet: AccountsSheet) => sheet._tag === 'InvalidSession',
  };
});

// Writable test source; the live session stream is covered in accounts/atoms.test.ts.
if (
  !Atom.isWritable<Atom.Type<typeof accountsSheetAtom>, Atom.Type<typeof accountsSheetAtom>>(
    accountsSheetAtom
  )
) {
  throw new Error('Expected a writable test session source');
}
const sheet = accountsSheetAtom;
const registry = AtomRegistry.make();
const expired = AsyncResult.success<AccountsSheet>({ _tag: 'InvalidSession', dismissable: true });
const idle = AsyncResult.success<AccountsSheet>({ _tag: 'Idle', dismissable: true });
afterEach(() => {
  registry.reset();
  navigation.pathname = '/';
  navigation.router.push.mockClear();
});

const presenter = () => (
  <RegistryContext.Provider value={registry}>
    <AccountsAutoPresenter />
  </RegistryContext.Provider>
);

it('keeps dismissal while the same settled expired result persists, but prompts again after idle returns to expired', async () => {
  const view = await render(presenter());
  expect(navigation.router.push).not.toHaveBeenCalled();
  await act(() => {
    registry.set(sheet, idle);
  });
  expect(navigation.router.push).not.toHaveBeenCalled();
  await act(() => {
    registry.set(sheet, expired);
  });
  expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith('/accounts', { withAnchor: true });
  navigation.pathname = '/accounts';
  await view.rerender(presenter());
  navigation.pathname = '/';
  await view.rerender(presenter());
  expect(navigation.router.push).toHaveBeenCalledTimes(1);
  await act(() => {
    registry.set(sheet, idle);
  });
  await act(() => {
    registry.set(sheet, expired);
  });
  expect(navigation.router.push).toHaveBeenCalledTimes(2);
});

it('does not present for loading or transport failures retaining a previous expired result', async () => {
  registry.set(sheet, AsyncResult.waiting(expired));
  await render(presenter());
  expect(navigation.router.push).not.toHaveBeenCalled();
  await act(() => {
    registry.set(
      sheet,
      AsyncResult.failureWithPrevious(Cause.die(new Error('offline')), {
        previous: Option.some(expired),
      })
    );
  });
  expect(navigation.router.push).not.toHaveBeenCalled();
});

it('does not push over existing account management, but can prompt after leaving it', async () => {
  navigation.pathname = '/accounts/profile';
  registry.set(sheet, expired);
  const view = await render(presenter());
  expect(navigation.router.push).not.toHaveBeenCalled();
  navigation.pathname = '/';
  await view.rerender(presenter());
  expect(navigation.router.push).toHaveBeenCalledTimes(1);
});
