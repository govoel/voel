import { scheduleTask } from '@effect/atom-react';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { CommonLayers } from '#src/services/layers.ts';

export const AppRegistry = AtomRegistry.make({ scheduleTask });

export const AppRuntime = Atom.runtime(CommonLayers);

AppRegistry.mount(AppRuntime);
