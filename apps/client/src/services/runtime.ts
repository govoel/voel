import { Layer, ManagedRuntime } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts.ts';
import { AppConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';

export const runtimeLayer = Layer.mergeAll(AccountManager.layer).pipe(
  Layer.provideMerge(DatabaseLive),
  Layer.provideMerge(AppConfig.layer)
);

export const Runtime = ManagedRuntime.make(runtimeLayer, { memoMap: Atom.defaultMemoMap });
