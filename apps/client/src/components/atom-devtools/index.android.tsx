import { AtomDevTools } from '@repo/atom-devtools-rn/android';

export const AppAtomDevTools = () => {
  // React Native replaces this global at bundle time.
  // oxlint-disable-next-line eslint/no-undef
  if (!__DEV__) {
    return null;
  }

  return <AtomDevTools />;
};
