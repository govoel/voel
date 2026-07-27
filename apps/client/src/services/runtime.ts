import { ManagedRuntime } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { CommonClientLayers } from '#src/services/layers.ts';

export const Runtime = ManagedRuntime.make(CommonClientLayers, { memoMap: Atom.defaultMemoMap });
export const AppRuntime = Atom.runtime(CommonClientLayers);
