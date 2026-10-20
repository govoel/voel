import { useAtomSuspense } from '@effect/atom-react';
import { Equal, Option } from 'effect';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { AccountsSheet } from '#src/domains/accounts/components/auto-presenter/model.ts';
import {
  accountsSheetAtom,
  accountsSheetIsIdle,
  accountsSheetIsOnboarding,
} from '#src/domains/accounts/components/auto-presenter/model.ts';

export const AccountsAutoPresenter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const sheet = useAtomSuspense(accountsSheetAtom);

  const lastPresentedRef = useRef<Option.Option<AccountsSheet>>(Option.none());

  useEffect(() => {
    if (accountsSheetIsIdle(sheet.value) || accountsSheetIsOnboarding(sheet.value)) {
      lastPresentedRef.current = Option.none();
      return;
    }

    if (pathname === '/accounts' || pathname.startsWith('/accounts/')) {
      lastPresentedRef.current = Option.some(sheet.value);
      return;
    }

    if (pathname === '/sign-in' || pathname === '/server-setup') {
      return;
    }

    if (
      Option.isSome(lastPresentedRef.current) &&
      Equal.equals(lastPresentedRef.current.value, sheet.value)
    ) {
      return;
    }

    lastPresentedRef.current = Option.some(sheet.value);
    router.push('/accounts', { withAnchor: true });
  }, [sheet, router, pathname]);

  return null;
};
