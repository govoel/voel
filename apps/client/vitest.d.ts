/* oxlint-disable typescript/no-empty-interface, typescript/no-empty-object-type -- module augmentation requires an interface */
import type { JestNativeMatchers } from '@testing-library/react-native/dist/matchers/types';

// React Native Testing Library augments Jest, but Vitest 5 needs its own matcher declaration.
declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
  > extends JestNativeMatchers<R> {}
}
