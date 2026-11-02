// oxlint-disable-next-line import/no-unassigned-import -- Augment the existing module, rather than replace it.
import 'effect/reactivity/Reactivity';

declare module 'effect/reactivity/Reactivity' {
  interface Keys {
    readonly account: never;
    readonly 'auth.users': never;
    readonly 'auth.sessions': never;
    readonly library: never;
  }
}
