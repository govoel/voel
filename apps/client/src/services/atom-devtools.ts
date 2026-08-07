import { makeWithStates } from '@repo/effect-atom-devtools-core';

// React Native replaces __DEV__ at bundle time. Keep predefined states
// available to tests that run outside React Native.
// oxlint-disable-next-line eslint/no-undef
const enabled = typeof __DEV__ !== 'boolean' || __DEV__;

export const withStates = makeWithStates({ enabled });
