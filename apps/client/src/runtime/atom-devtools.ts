import { makeWithPredefinedStates } from '@repo/effect-atom-devtools-core';

// React Native replaces __DEV__, and Expo tree shaking removes the development-only import.
// Keep predefined states available to tests that run outside React Native.
export const withPredefinedStates: ReturnType<typeof makeWithPredefinedStates> =
  // oxlint-disable-next-line eslint/no-undef
  typeof __DEV__ !== 'boolean' || __DEV__
    ? makeWithPredefinedStates({ enabled: true })
    : <T>(_states: () => ReadonlyArray<unknown>) =>
        (atom: T): T =>
          atom;
