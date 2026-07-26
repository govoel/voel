import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';

export const CommonGlobalLayers = CurrentAuthClient.layer.pipe(
  Layer.provideMerge(AccountManager.layer),
  Layer.provideMerge(Layer.mergeAll(FetchHttpClient.layer, Reactivity.layer))
);
