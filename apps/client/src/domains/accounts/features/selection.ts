import { make, useAtomValue } from '@effect/atom-react';
import { Atom } from 'effect/reactivity';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';


/** Concrete selection for the protected app subtree; the provider is keyed by storage identity. */
const selectedAccount = make((key: AccountStorageKey) => Atom.make(() => key));

export const SelectedAccountProvider = selectedAccount.Provider;

// The compiler must recognize the scoped accessor as a hook, not memoize its context read.
// oxlint-disable-next-line typescript/unbound-method -- ScopedAtom.use closes over Context; it does not use this.
const useSelectedAccountAtom = selectedAccount.use;

export const useSelectedAccount = () => useAtomValue(useSelectedAccountAtom());
