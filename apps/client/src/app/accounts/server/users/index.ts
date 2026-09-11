import { Clock, Effect } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { AppState } from 'react-native';

import { createNativePager } from '@repo/native-paging';
import { PagerOptions, connectPager } from '@repo/native-paging/model';

import { AppRuntime } from '#src/services/runtime.ts';
import { usersPageLoaderAtom } from '#src/services/users.ts';

export const usersPagerAtom = AppRuntime.atom((get) =>
  Effect.gen(function* () {
    const load = yield* get.result(usersPageLoaderAtom, { suspendOnWaiting: true });
    const pager = createNativePager(
      PagerOptions.make({
        pageSize: 50,
        maxItems: 250,
        prefetchDistance: 10,
      })
    );
    yield* connectPager({
      pager,
      load,
    });
    const clock = yield* Clock.Clock;
    let refreshedAt = clock.currentTimeMillisUnsafe();
    const focus = AppState.addEventListener('change', (state) => {
      if (state === 'active' && clock.currentTimeMillisUnsafe() - refreshedAt >= 10_000) {
        refreshedAt = clock.currentTimeMillisUnsafe();
        pager.refresh();
      }
    });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        focus.remove();
      })
    );
    return pager;
  })
).pipe(
  Atom.setIdleTTL(0),
  // Never present a closed previous account's handle while its replacement is being acquired.
  Atom.map((result) => (result.waiting ? AsyncResult.initial(true) : result)),
  Atom.setIdleTTL(0),
  Atom.withLabel('usersPagerAtom')
);
