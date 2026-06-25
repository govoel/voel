import { scheduleTask } from '@effect/atom-react';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { CommonExpoLayers } from '#src/services/layers.ts';

export const AppRegistry = AtomRegistry.make({ scheduleTask });

export const AppRuntime = Atom.runtime(CommonExpoLayers);

AppRegistry.mount(AppRuntime);
