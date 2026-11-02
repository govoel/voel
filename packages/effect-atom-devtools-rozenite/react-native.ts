import { Layer } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

// The type import includes the lazy implementation in Rozenite's TypeScript emit graph.
import type * as Development from './src/react-native/layer.ts';

declare const __DEV__: boolean;
declare const require: (id: './src/react-native/layer.js') => typeof Development;

// React Native replaces __DEV__, allowing Metro to remove the development-only implementation.
const isDevelopment = typeof __DEV__ !== 'boolean' || __DEV__;
// oxlint-disable-next-line unicorn/no-typeof-undefined
const isBrowser = typeof globalThis.window !== 'undefined';

export const AtomDevToolsLayer: Layer.Layer<never, never, AtomRegistry.AtomRegistry> =
  isDevelopment && isBrowser
    ? // oxlint-disable-next-line node/global-require, typescript/no-require-imports, typescript/no-var-requires, unicorn/prefer-module
      require('./src/react-native/layer.js').AtomDevToolsLayer
    : Layer.empty;
