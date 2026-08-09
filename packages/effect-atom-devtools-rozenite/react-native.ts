import { Layer } from 'effect';
import type { AtomRegistry } from 'effect/unstable/reactivity';

import type { AtomDevTools } from '@repo/effect-atom-devtools-core/atom-dev-tools';

type AtomDevToolsRozeniteLayer = Layer.Layer<AtomDevTools, never, AtomRegistry.AtomRegistry>;

declare const __DEV__: boolean;

// React Native replaces __DEV__, allowing Metro to remove the development-only implementation.
// Keep the no-op export usable in server rendering and production bundles.
const isDev = typeof __DEV__ !== 'boolean' || __DEV__;
// oxlint-disable-next-line unicorn/no-typeof-undefined
const isServer = typeof globalThis.window === 'undefined';

// This is the same development-only entry-point pattern used by Rozenite v2 plugins.
/* oxlint-disable typescript/no-unsafe-assignment */
export const AtomDevToolsRozeniteLive: AtomDevToolsRozeniteLayer =
  isDev && !isServer
    ? // oxlint-disable-next-line node/global-require, typescript/no-require-imports, typescript/no-unsafe-member-access, typescript/no-var-requires, unicorn/prefer-module
      require('#src/react-native/layer.ts').AtomDevToolsRozeniteLive
    : Layer.empty;
/* oxlint-enable typescript/no-unsafe-assignment */
