import { scheduleTask } from '@effect/atom-react';
import { AtomRegistry } from 'effect/reactivity';

import { AppRuntime } from '#src/runtime/index.ts';

export const AppRegistry = AtomRegistry.make({ scheduleTask });

AppRegistry.mount(AppRuntime);
