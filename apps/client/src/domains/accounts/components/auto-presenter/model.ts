import { Array, Data, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export type AccountsSheet = Data.TaggedEnum<{
  readonly Idle: { readonly dismissable: true };
  readonly Onboarding: { readonly dismissable: false };
  readonly MustPickAccount: { readonly dismissable: false };
  readonly InvalidSession: { readonly dismissable: true };
}>;

export const AccountsSheet = Data.taggedEnum<
  Data.TaggedEnum<{
    readonly Idle: { readonly dismissable: true };
    readonly Onboarding: { readonly dismissable: false };
    readonly MustPickAccount: { readonly dismissable: false };
    readonly InvalidSession: { readonly dismissable: true };
  }>
>();

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
          return Stream.succeed<AccountsSheet>(AccountsSheet.Onboarding({ dismissable: false }));
        }

        return Stream.succeed<AccountsSheet>(AccountsSheet.MustPickAccount({ dismissable: false }));
      }

      const authClient = yield* AuthClientMap.use((authClients) =>
        authClients.acquire(ActiveAccountKey.make(activeAccount.value))
      );
      return authClient.sessionChanges.pipe(
        Stream.map((session): AccountsSheet =>
          AsyncResult.isSuccess(session) && !session.waiting && Option.isNone(session.value)
            ? AccountsSheet.InvalidSession({ dismissable: true })
            : AccountsSheet.Idle({ dismissable: true })
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
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.Idle({ dismissable: true }))),
    },
    {
      id: PredefinedStateId.make('onboarding'),
      label: 'Onboarding',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.Onboarding({ dismissable: false }))),
    },
    {
      id: PredefinedStateId.make('must-pick-account'),
      label: 'Must pick an account',
      atom: Atom.make(() =>
        AsyncResult.success(AccountsSheet.MustPickAccount({ dismissable: false }))
      ),
    },
    {
      id: PredefinedStateId.make('invalid-session'),
      label: 'Invalid session',
      atom: Atom.make(() =>
        AsyncResult.success(AccountsSheet.InvalidSession({ dismissable: true }))
      ),
    },
  ]),
  Atom.withEquality(Equal.equals),
  Atom.withLabel('accountsSheetAtom')
);
