import { Atom } from 'effect/unstable/reactivity';

import { AppRuntimeLayers } from '#src/services/layers.ts';

export const AppRuntime = Atom.runtime(AppRuntimeLayers).pipe(Atom.withLabel('AppRuntime'));
