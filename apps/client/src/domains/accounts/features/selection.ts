import { make, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';

/**
 * The provider seeds a concrete admitted identity once, but its atom follows selection.
 * On absence/failure only, retain the last observed key while admission removes this
 * subtree. This is not a global selection fallback: the root still sees actual None
 * or failure. Operations capture the concrete key from their account-owned content.
 */
const selectedAccount = make((admittedKey: AccountStorageKey) =>
  Atom.make((get) => {
    const selection = get(activeAccountKeyAtom);
    if (AsyncResult.isSuccess(selection) && Option.isSome(selection.value)) {
      return selection.value.value;
    }
    return Option.getOrElse(get.self<AccountStorageKey>(), () => admittedKey);
  })
);

export const SelectedAccountProvider = selectedAccount.Provider;

// The compiler must recognize the scoped accessor as a hook, not memoize its context read.
// oxlint-disable-next-line typescript/unbound-method -- ScopedAtom.use closes over Context; it does not use this.
const useSelectedAccountAtom = selectedAccount.use;

export const useSelectedAccount = () => useAtomValue(useSelectedAccountAtom());
