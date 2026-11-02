import { useAtomSuspense } from '@effect/atom-react';
import { Effect, Option, Stream, String, pipe } from 'effect';
import { Atom } from 'effect/reactivity';
import type { Stack } from 'expo-router';
import { Redirect } from 'expo-router';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';

import { AccountManager } from '#src/domains/accounts/manager.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const activeAccountKeyAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
).pipe(
  (source) =>
    AppRuntime.atom((get) =>
      get.result(source).pipe(
        Effect.catchTags({
          NoSuchElementError: () => Effect.succeedNone,
        })
      )
    ),
  Atom.withLabel('activeAccountKeyAtom')
);

export const SelectedAccountBoundary = ({
  children,
  fallback,
}: PropsWithChildren<{ readonly fallback: ReactNode }>): ReactNode => {
  const selected = useAtomSuspense(activeAccountKeyAtom).value;
  return Option.match(selected, {
    onNone: (): ReactNode => fallback,
    onSome: (key) => (
      <SelectedAccountContext.Provider
        key={JSON.stringify([key.serverUrl, key.userId])}
        value={key}>
        {children}
      </SelectedAccountContext.Provider>
    ),
  });
};

export const AccountManagementBoundary = ({ children }: PropsWithChildren) => (
  <SelectedAccountBoundary fallback={<Redirect href="/accounts" />}>
    {children}
  </SelectedAccountBoundary>
);

export const accountManagementScreenLayout = (({ route, children }) =>
  pipe(route.name, String.startsWith('(selected)/')) ? (
    <AccountManagementBoundary>{children}</AccountManagementBoundary>
  ) : (
    children
  )) satisfies NonNullable<ComponentProps<typeof Stack>['screenLayout']>;
