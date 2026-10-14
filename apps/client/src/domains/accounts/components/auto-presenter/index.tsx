import { useAtomValue } from '@effect/atom-react';
import { Equal, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { AccountsSheet } from '#src/domains/accounts/components/auto-presenter/model.ts';
import { accountsSheetAtom, accountsSheetIsInvalidSession } from '#src/domains/accounts/components/auto-presenter/model.ts';


export const AccountsAutoPresenter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const sheet = useAtomValue(accountsSheetAtom);

  const lastPresentedRef = useRef<Option.Option<AccountsSheet>>(Option.none());

  useEffect(() => {
    if (
      !AsyncResult.isSuccess(sheet) ||
      sheet.waiting ||
      !accountsSheetIsInvalidSession(sheet.value)
    ) {
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
