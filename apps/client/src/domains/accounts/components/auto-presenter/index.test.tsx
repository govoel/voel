import { render } from '@testing-library/react-native';
import { beforeEach, expect, it, vi } from 'vitest';

import { AccountsAutoPresenter } from '#src/domains/accounts/components/auto-presenter/index.tsx';
import type { AccountsSheet } from '#src/domains/accounts/components/auto-presenter/model.ts';

const navigation = vi.hoisted(() => ({
  pathname: '/',
  sheet: { _tag: 'Onboarding', dismissable: false } as AccountsSheet,
  router: { push: vi.fn() },
}));

vi.mock('expo-router', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));

vi.mock('@effect/atom-react', () => ({
  useAtomSuspense: () => ({ value: navigation.sheet }),
}));

// Account/session state is covered by atoms.test.ts; these tests exercise navigation effects.
vi.mock('#src/domains/accounts/components/auto-presenter/model.ts', () => ({
  accountsSheetAtom: Symbol('accountsSheetAtom'),
  accountsSheetIsIdle: (sheet: AccountsSheet) => sheet._tag === 'Idle',
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.pathname = '/';
  navigation.sheet = { _tag: 'Onboarding', dismissable: false };
});

it('leaves the empty-account Welcome state to the main shell', async () => {
  await render(<AccountsAutoPresenter />);

  expect(navigation.router.push).not.toHaveBeenCalled();
});

it.each(['MustPickAccount', 'InvalidSession'] as const)(
  'still presents account management for %s, without reopening a dismissed sheet',
  async (tag) => {
    navigation.sheet =
      tag === 'MustPickAccount'
        ? { _tag: tag, dismissable: false }
        : { _tag: tag, dismissable: true };
    const view = await render(<AccountsAutoPresenter />);

    expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith('/accounts', {
      withAnchor: true,
    });

    await view.rerender(<AccountsAutoPresenter />);
    expect(navigation.router.push).toHaveBeenCalledTimes(1);
  }
);

it('does not reopen an expired-session sheet that was already visible when the session expired', async () => {
  navigation.pathname = '/accounts';
  navigation.sheet = { _tag: 'Idle', dismissable: true };
  const view = await render(<AccountsAutoPresenter />);
  navigation.sheet = { _tag: 'InvalidSession', dismissable: true };
  await view.rerender(<AccountsAutoPresenter />);
  navigation.pathname = '/';
  await view.rerender(<AccountsAutoPresenter />);
  expect(navigation.router.push).not.toHaveBeenCalled();
});

it.each(['/sign-in', '/server-setup'])(
  'does not cover the public form %s with account management',
  async (pathname) => {
    navigation.pathname = pathname;
    navigation.sheet = { _tag: 'InvalidSession', dismissable: true };
    await render(<AccountsAutoPresenter />);
    expect(navigation.router.push).not.toHaveBeenCalled();
  }
);
