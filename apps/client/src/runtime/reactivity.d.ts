// oxlint-disable-next-line import/no-unassigned-import -- Augment the existing module, rather than replace it.
import 'effect/reactivity/Reactivity';

// The client tsconfig includes this for application and test files. Keep it out of
// reusable packages: augmentation makes keys strict throughout the consuming program.
declare module 'effect/reactivity/Reactivity' {
  interface Keys {
    readonly account: never;
    readonly 'auth.users': never;
    readonly 'auth.sessions': never;
    readonly library: never;
  }
}
