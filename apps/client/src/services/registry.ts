import { scheduleTask } from '@effect/atom-react';
import { AtomRegistry } from 'effect/unstable/reactivity';

import { AppRuntime } from '#src/services/runtime.ts';

export const AppRegistry = AtomRegistry.make({ scheduleTask });

AppRegistry.mount(AppRuntime);
