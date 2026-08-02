// oxlint-disable-next-line node/no-process-env
const isDev = process.env.NODE_ENV !== 'production';
// oxlint-disable-next-line typescript/no-unnecessary-condition
const isServer = globalThis.window === void 0;

// oxlint-disable-next-line typescript/no-unsafe-assignment
export const useAtomDevToolsPlugin: () => void =
  isDev && !isServer
    ? // oxlint-disable-next-line typescript/no-require-imports, typescript/no-var-requires, node/global-require, unicorn/prefer-module, typescript/no-unsafe-member-access
      require('#src/react-native/use-atom-devtools-plugin.ts').useAtomDevToolsPlugin
    : // oxlint-disable-next-line eslint/no-empty-function
      () => {};
