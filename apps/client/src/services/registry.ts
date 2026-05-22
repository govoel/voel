import { scheduleTask } from '@effect/atom-react';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { runtimeLayer } from '#src/services/runtime.ts';

export const AppRegistry = AtomRegistry.make({ scheduleTask });

export const AppRuntime = Atom.runtime(runtimeLayer);

AppRegistry.mount(AppRuntime);
