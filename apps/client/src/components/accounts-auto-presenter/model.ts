import { Data, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { accountsAtom, activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { acquireAuthClient } from '#src/services/auth-client';
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

export const AccountsSheetIsIdle = AccountsSheet.$is('Idle');

export const accountsSheetAtom = AppRuntime.atom(
  Effect.fnUntraced(
    function* (get) {
      const activeAccountKey = yield* get.result(activeAccountKeyAtom);
      if (Option.isNone(activeAccountKey)) {
        const accounts = yield* get.result(accountsAtom);
        if (accounts.length === 0) {
          return Stream.succeed<AccountsSheet>(AccountsSheet.Onboarding({ dismissable: false }));
        }

        return Stream.succeed<AccountsSheet>(AccountsSheet.MustPickAccount({ dismissable: false }));
      }

      const authClient = yield* acquireAuthClient(activeAccountKey.value);
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
      id: 'idle',
      label: 'Idle',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.Idle({ dismissable: true }))),
    },
    {
      id: 'onboarding',
      label: 'Onboarding',
      atom: Atom.make(() => AsyncResult.success(AccountsSheet.Onboarding({ dismissable: false }))),
    },
    {
      id: 'must-pick-account',
      label: 'Must pick an account',
      atom: Atom.make(() =>
        AsyncResult.success(AccountsSheet.MustPickAccount({ dismissable: false }))
      ),
    },
    {
      id: 'invalid-session',
      label: 'Invalid session',
      atom: Atom.make(() =>
        AsyncResult.success(AccountsSheet.InvalidSession({ dismissable: true }))
      ),
    },
  ]),
  Atom.withEquality(Equal.equals),
  Atom.withLabel('accountsSheetAtom')
);
