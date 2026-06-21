import { useAtomSuspense } from '@effect/atom-react';
import { Option } from 'effect';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { accountsSheetAtom } from '#src/services/accounts/atoms.ts';

export const AccountsAutoPresenter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const sheet = useAtomSuspense(accountsSheetAtom);

  const lastPresentedRef = useRef<Option.Option<(typeof sheet)['value']['mode']>>(Option.none());

  useEffect(() => {
    if (sheet.value.mode === 'IDLE') {
      lastPresentedRef.current = Option.none();
      return;
    }

    if (
      Option.isSome(lastPresentedRef.current) &&
      lastPresentedRef.current.value === sheet.value.mode
    ) {
      return;
    }

    if (pathname.startsWith('/accounts')) {
      return;
    }

    lastPresentedRef.current = Option.some(sheet.value.mode);
    router.push('/accounts', { withAnchor: true });
  }, [sheet, router, pathname]);

  return null;
};
