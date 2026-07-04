import { ManagedRuntime } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { CommonExpoLayers } from '#src/services/layers.ts';

export const Runtime = ManagedRuntime.make(CommonExpoLayers, { memoMap: Atom.defaultMemoMap });
