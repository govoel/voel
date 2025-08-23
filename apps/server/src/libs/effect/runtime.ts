import { Path } from '@effect/platform';
import { Layer, ManagedRuntime } from 'effect';

import { Audible } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';

const appLayer = Layer.mergeAll(Audible.Default, FsExtended.Default, Path.layer, Hash.Default);

export const AppRuntime = ManagedRuntime.make(appLayer);
