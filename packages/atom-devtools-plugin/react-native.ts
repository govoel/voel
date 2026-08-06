// @effect-diagnostics effect/processEnv:off
import { Layer } from 'effect';
import type { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import type { AtomDevTools } from '@repo/atom-devtools-core';

// oxlint-disable-next-line node/no-process-env
const isDev = process.env.NODE_ENV !== 'production';
// oxlint-disable-next-line typescript/no-unnecessary-condition
const isServer = globalThis.window === void 0;

type UseAtomDevToolsPlugin = <R, ER>(runtime: Atom.AtomRuntime<AtomDevTools | R, ER>) => void;

export const useAtomDevToolsPlugin: UseAtomDevToolsPlugin = (runtime) => {
  if (isDev && !isServer) {
    // oxlint-disable-next-line typescript/no-require-imports, typescript/no-var-requires, node/global-require, unicorn/prefer-module, typescript/no-unsafe-call, typescript/no-unsafe-member-access
    require('#src/react-native/use-atom-devtools-plugin.ts').useAtomDevToolsPlugin(runtime);
  }
};

export const AtomDevToolsPluginLayer: Layer.Layer<AtomDevTools, never, AtomRegistry.AtomRegistry> =
  isDev && !isServer
    ? Layer.suspend(
        // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-require-imports, typescript/no-var-requires, node/global-require, unicorn/prefer-module, typescript/no-unsafe-member-access
        () => require('#src/react-native/layer.ts').AtomDevToolsPluginLayer
      )
    : // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (Layer.empty as unknown as Layer.Layer<AtomDevTools, never, AtomRegistry.AtomRegistry>);
