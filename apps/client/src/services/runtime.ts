import { Atom } from 'effect/unstable/reactivity';

import { AppLayers } from '#src/services/layers.ts';

export const AppRuntime = Atom.runtime(AppLayers).pipe(Atom.withLabel('AppRuntime'));
