import { useAtomValue } from '@effect/atom-react';
import { AsyncResult } from 'effect/unstable/reactivity';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { accountsSheetAtom } from '#src/services/accounts/atoms.ts';

export default function AccountsAutoPresenter() {
  const sheet = useAtomValue(accountsSheetAtom);
  const router = useRouter();
  const pathname = usePathname();
  const lastPresentedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!AsyncResult.isSuccess(sheet)) {
      return;
    }

    const {
      value: { mode },
    } = sheet;

    if (!(mode === 'ONBOARDING' || mode === 'MUST_PICK_ACCOUNT' || mode === 'INVALID_SESSION')) {
      lastPresentedRef.current = null;
      return;
    }

    if (lastPresentedRef.current === mode) {
      return;
    }
    if (pathname.startsWith('/accounts')) {
      return;
    }

    lastPresentedRef.current = mode;
    router.navigate('/accounts');
  }, [sheet, router, pathname]);

  return null;
}
