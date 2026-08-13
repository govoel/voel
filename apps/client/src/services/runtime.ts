import { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AppRuntimeLayers } from '#src/services/layers.ts';

export const AppRuntime = Atom.runtime(
  AppRuntimeLayers.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
