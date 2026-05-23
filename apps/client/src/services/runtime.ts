import { ManagedRuntime } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { CommonLayers } from '#src/services/layers.ts';

export const Runtime = ManagedRuntime.make(CommonLayers, { memoMap: Atom.defaultMemoMap });
