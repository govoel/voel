import { makeWithPredefinedStates } from '@repo/effect-atom-devtools-core';

export const withPredefinedStates: ReturnType<typeof makeWithPredefinedStates> =
  // oxlint-disable-next-line eslint/no-undef
  typeof __DEV__ !== 'boolean' || __DEV__
    ? makeWithPredefinedStates({ enabled: true })
    : <T>(_states: () => ReadonlyArray<unknown>) =>
        (atom: T): T =>
          atom;
