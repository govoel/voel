import { useAtomSuspense } from '@effect/atom-react';
import { Equal, Match, Option, String, pipe } from 'effect';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { AccountsSheet } from '#src/domains/accounts/components/auto-presenter/model.ts';
import { accountsSheetAtom } from '#src/domains/accounts/components/auto-presenter/model.ts';

export const AccountsAutoPresenter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const sheet = useAtomSuspense(accountsSheetAtom);

  const lastPresentedRef = useRef<Option.Option<AccountsSheet>>(Option.none());

  useEffect(() => {
    Match.value(sheet.value).pipe(
      Match.tag('Idle', 'Onboarding', () => {
        lastPresentedRef.current = Option.none();
        return void 0;
      }),
      Match.tag('MustPickAccount', 'InvalidSession', (selection) => {
        if (pathname === '/accounts' || pipe(pathname, String.startsWith('/accounts/'))) {
          lastPresentedRef.current = Option.some(selection);
          return void 0;
        }

        if (pathname === '/sign-in' || pathname === '/server-setup') {
          return void 0;
        }

        if (
          Option.isSome(lastPresentedRef.current) &&
          Equal.equals(lastPresentedRef.current.value, selection)
        ) {
          return void 0;
        }

        lastPresentedRef.current = Option.some(selection);
        router.push('/accounts', { withAnchor: true });
        return void 0;
      }),
      Match.exhaustive
    );
  }, [sheet, router, pathname]);

  return null;
};
