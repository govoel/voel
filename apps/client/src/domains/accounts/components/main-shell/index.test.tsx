import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { expect, it, vi } from 'vitest';

import { MainShell } from '#src/domains/accounts/components/main-shell/index.tsx';

const state = vi.hoisted(() => ({ hasAccounts: false }));

vi.mock('@effect/atom-react', () => ({
  useAtomSuspense: () => ({ value: state.hasAccounts ? ['account'] : [] }),
}));
vi.mock('#src/domains/accounts/atoms.ts', () => ({ accountsAtom: Symbol('accountsAtom') }));
vi.mock('#src/domains/accounts/components/welcome', () => ({
  Welcome: () => <Text>Welcome</Text>,
}));

it('switches base content in place when the first account is added and the last is removed', async () => {
  const view = await render(
    <MainShell>
      <Text>Home</Text>
    </MainShell>
  );
  expect(screen.getByText('Welcome')).toBeOnTheScreen();

  state.hasAccounts = true;
  await view.rerender(
    <MainShell>
      <Text>Home</Text>
    </MainShell>
  );
  expect(screen.getByText('Home')).toBeOnTheScreen();
  expect(screen.queryByText('Welcome')).toBeNull();

  state.hasAccounts = false;
  await view.rerender(
    <MainShell>
      <Text>Home</Text>
    </MainShell>
  );
  expect(screen.getByText('Welcome')).toBeOnTheScreen();
  expect(screen.queryByText('Home')).toBeNull();
});
