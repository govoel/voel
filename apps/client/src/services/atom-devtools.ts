import { makeWithStates } from '@repo/effect-atom-devtools-core';

// React Native replaces __DEV__, and Expo tree shaking removes the development-only import.
// Keep predefined states available to tests that run outside React Native.
export const withStates: ReturnType<typeof makeWithStates> =
  // oxlint-disable-next-line eslint/no-undef
  typeof __DEV__ !== 'boolean' || __DEV__
    ? makeWithStates({ enabled: true })
    : <T>(_states: () => readonly unknown[]) =>
        (atom: T): T =>
          atom;
