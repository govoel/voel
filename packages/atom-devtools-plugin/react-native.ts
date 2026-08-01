declare const __DEV__: boolean;

export let useAtomDevToolsPlugin: typeof import('./src/react-native/useAtomDevToolsPlugin.ts').useAtomDevToolsPlugin;

// React Native replaces this global at bundle time, so production bundles do not load
// Effect, the plugin bridge, or the agent bridge.
// oxlint-disable-next-line eslint/no-undef
if (typeof __DEV__ === 'boolean' && __DEV__) {
  useAtomDevToolsPlugin =
    require('./src/react-native/useAtomDevToolsPlugin.ts').useAtomDevToolsPlugin;
} else {
  useAtomDevToolsPlugin = () => {};
}
