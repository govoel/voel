import { useAtomSuspense } from '@effect/atom-react';
import { Equal, Option } from 'effect';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { AccountsSheet } from '#src/components/accounts-auto-presenter/model.ts';
import {
  AccountsSheetIsIdle,
  accountsSheetAtom,
} from '#src/components/accounts-auto-presenter/model.ts';

export const AccountsAutoPresenter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const sheet = useAtomSuspense(accountsSheetAtom);

  const lastPresentedRef = useRef<Option.Option<AccountsSheet>>(Option.none());

  useEffect(() => {
    if (AccountsSheetIsIdle(sheet.value)) {
      lastPresentedRef.current = Option.none();
      return;
    }

    if (
      Option.isSome(lastPresentedRef.current) &&
      Equal.equals(lastPresentedRef.current.value, sheet.value)
    ) {
      return;
    }

    if (pathname.startsWith('/accounts')) {
      return;
    }

    lastPresentedRef.current = Option.some(sheet.value);
    router.push('/accounts', { withAnchor: true });
  }, [sheet, router, pathname]);

  return null;
};
