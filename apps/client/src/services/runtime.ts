import { Atom } from 'effect/unstable/reactivity';

import { CommonClientLayers } from '#src/services/layers.ts';

export const AppRuntime = Atom.runtime(CommonClientLayers).pipe(Atom.withLabel('App runtime'));
