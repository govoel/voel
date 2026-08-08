// The imported type also defines the local development/no-op function signature.
// oxlint-disable-next-line unicorn/prefer-export-from
import type { UseAtomDevToolsOptions } from '#src/react-native/use-atom-dev-tools.ts';

export type { UseAtomDevToolsOptions };

// React Native replaces __DEV__, allowing Metro to remove the development-only implementation.
// Keep the no-op export usable in server rendering and production bundles.
// oxlint-disable-next-line eslint/no-undef
const isDev = typeof __DEV__ !== 'boolean' || __DEV__;
// oxlint-disable-next-line unicorn/no-typeof-undefined
const isServer = typeof globalThis.window === 'undefined';

// This is the same development-only entry-point pattern used by Rozenite v2 plugins.
/* oxlint-disable typescript/no-unsafe-assignment */
export const useAtomDevTools: (options: UseAtomDevToolsOptions) => void =
  isDev && !isServer
    ? // oxlint-disable-next-line eslint/prefer-destructuring, node/global-require, typescript/no-require-imports, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-var-requires, unicorn/prefer-module
      require('#src/react-native/use-atom-dev-tools.ts').useAtomDevTools
    : () => void 0;
/* oxlint-enable typescript/no-unsafe-assignment */
