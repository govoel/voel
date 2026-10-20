import { Array, Data, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export type AccountsSheet =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Onboarding' }
  | { readonly _tag: 'MustPickAccount' }
  | { readonly _tag: 'InvalidSession' };

export const AccountsSheet = Data.taggedEnum<AccountsSheet>();

export const accountsSheetIsIdle = AccountsSheet.$is('Idle');
export const accountsSheetIsOnboarding = AccountsSheet.$is('Onboarding');
export const accountsSheetIsMustPickAccount = AccountsSheet.$is('MustPickAccount');
export const accountsSheetIsInvalidSession = AccountsSheet.$is('InvalidSession');

export const accountsSheetAtom = AppRuntime.atom(
  Effect.fnUntraced(
    function* (get) {
      // Read account presence and selection from one snapshot so sign-in cannot
      // temporarily look like saved accounts without an active account.
      const accounts = yield* get.result(accountsAtom);
      const activeAccount = Array.findFirst(accounts, (account) => account.active);
      if (Option.isNone(activeAccount)) {
        if (accounts.length === 0) {
          return Stream.succeed<AccountsSheet>(AccountsSheet.Onboarding());
        }

        return Stream.succeed<AccountsSheet>(AccountsSheet.MustPickAccount());
      }

      const authClient = yield* AuthClientMap.use((authClients) =>
        authClients.acquire(ActiveAccountKey.make(activeAccount.value))
      );
      return authClient.sessionChanges.pipe(
        Stream.map((session): AccountsSheet =>
          AsyncResult.isSuccess(session) && !session.waiting && Option.isNone(session.value)
            ? AccountsSheet.InvalidSession()
            : AccountsSheet.Idle()
        )
      );
    },
    (effect) => Stream.unwrap(effect)
  )
).pipe(
  withPredefinedStates(() => [
    {
      id: PredefinedStateId.make('idle'),
      label: 'Idle',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.Idle())),
    },
    {
      id: PredefinedStateId.make('onboarding'),
      label: 'Onboarding',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.Onboarding())),
    },
    {
      id: PredefinedStateId.make('must-pick-account'),
      label: 'Must pick an account',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.MustPickAccount())),
    },
    {
      id: PredefinedStateId.make('invalid-session'),
      label: 'Invalid session',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.InvalidSession())),
    },
  ]),
  Atom.withEquality(Equal.equals),
  Atom.withLabel('accountsSheetAtom')
);
