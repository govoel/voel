import { Data, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import {
  accountAuthClientAtom,
  accountsAtom,
  activeAccountKeyAtom,
} from '#src/services/accounts/atoms.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { AppRuntime } from '#src/services/runtime.ts';

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
export const accountsSheetIsInvalidSession = AccountsSheet.$is('InvalidSession');

const accountSheetAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.atom(
    Effect.fnUntraced(
      function* (get) {
        if (Option.isNone(account)) {
          const accounts = yield* get.result(accountsAtom);
          return Stream.succeed<AccountsSheet>(
            accounts.length === 0
              ? AccountsSheet.Onboarding({ dismissable: false })
              : AccountsSheet.MustPickAccount({ dismissable: false })
          );
        }
        const authClient = yield* get.result(accountAuthClientAtom(account));
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
  )
);

export const accountsSheetAtom = Atom.make((get) =>
  // oxlint-disable-next-line unicorn/no-array-method-this-argument -- AsyncResult.flatMap is not an array method.
  AsyncResult.flatMap(get(activeAccountKeyAtom), (account) => get(accountSheetAtom(account)))
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
