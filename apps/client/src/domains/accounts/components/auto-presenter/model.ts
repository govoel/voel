import { Data, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { accountAuthClientAtom, activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export type AccountsSheet = Data.TaggedEnum<{
  readonly Idle: { readonly dismissable: true };
  readonly InvalidSession: { readonly dismissable: true };
}>;

export const AccountsSheet = Data.taggedEnum<AccountsSheet>();

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
  AsyncResult.flatMap(get(activeAccountKeyAtom), (account) =>
    Option.match(account, {
      onNone: () => AsyncResult.success(AccountsSheet.Idle({ dismissable: true })),
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
