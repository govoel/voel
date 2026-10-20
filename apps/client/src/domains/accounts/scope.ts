import { make as makeScopedAtom } from '@effect/atom-react';
import { Equal } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

// Effect 4 families use structural equality. A fresh mount must not reuse a
// previous scope's state, even while old subscriptions are still alive.
export const SelectedAccount = makeScopedAtom(
  (key: ActiveAccountKey): Atom.Atom<ActiveAccountKey> => Equal.byReference(Atom.make(key))
);

// A conventional hook name lets React Compiler preserve this context read on every render.
// eslint-disable-next-line @typescript-eslint/unbound-method -- ScopedAtom.use closes over Context, not this.
export const useSelectedAccount = SelectedAccount.use;

export const accountAuthClientAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.atom((get) => AuthClientMap.use((clients) => clients.acquire(get(account))))
);

export const accountAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.atom((get) =>
    AccountRepository.use((repository) => repository.getByStorageKey(get(account))).pipe(
      Reactivity.stream(['account'])
    )
  )
);
