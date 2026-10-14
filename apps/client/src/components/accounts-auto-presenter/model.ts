import { Data, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import {
  accountAuthClientAtom,
  accountsAtom,
  activeAccountKeyAtom,
} from '#src/services/accounts/atoms.ts';
import type { AccountStorageKey } from '#src/services/accounts/index.ts';
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

const accountSheetAtom = Atom.family((account: AccountStorageKey) =>
  AppRuntime.atom(
    Effect.fnUntraced(
      function* (get) {
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
  AsyncResult.flatMap(
    get(activeAccountKeyAtom),
    (
      account
    ): AsyncResult.AsyncResult<
      AccountsSheet,
      Atom.Failure<typeof accountsAtom> | Atom.Failure<ReturnType<typeof accountSheetAtom>>
    > =>
      Option.match(account, {
        onNone: () =>
          AsyncResult.map(get(accountsAtom), (accounts): AccountsSheet =>
            accounts.length === 0
              ? AccountsSheet.Onboarding({ dismissable: false })
              : AccountsSheet.MustPickAccount({ dismissable: false })
          ),
        onSome: (key) => get(accountSheetAtom(key)),
      })
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
