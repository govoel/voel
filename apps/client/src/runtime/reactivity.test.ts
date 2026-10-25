/* oxlint-disable effecttsgo/floating-effect -- compile-time API checks construct effects without running them */
import { Effect, Layer } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';
import { expectTypeOf, it } from 'vitest';

// These assertions and @ts-expect-error checks run in the client's TypeScript
// program, using its registry rather than declaring a separate test registry.
it('accepts the current collection keys at public and captured-service boundaries', () => {
  const keys = ['account', 'auth.users', 'auth.sessions', 'library'] satisfies Reactivity.KeysInput;
  expectTypeOf(keys).toExtend<Reactivity.KeysInput>();

  Reactivity.invalidate(keys);
  Effect.void.pipe(Reactivity.mutation(keys));
  Effect.void.pipe(Reactivity.query(keys));
  Effect.void.pipe(Reactivity.stream(keys));
  Atom.withReactivity(keys);
  Atom.runtime(Layer.empty).fn(() => Effect.void, { reactivityKeys: keys });
});

it('rejects undeclared names in checked reactivity APIs', () => {
  // @ts-expect-error Captured-service inputs must also use declared names.
  ['accounts'] satisfies Reactivity.KeysInput;
  // @ts-expect-error Undeclared collection key.
  Reactivity.invalidate(['accounts']);
  // @ts-expect-error Undeclared record key.
  Reactivity.invalidate({ accounts: [] });
  // @ts-expect-error Undeclared mutation key.
  Effect.void.pipe(Reactivity.mutation(['accounts']));
  // @ts-expect-error Undeclared query key.
  Effect.void.pipe(Reactivity.query(['accounts']));
  // @ts-expect-error Undeclared stream key.
  Effect.void.pipe(Reactivity.stream(['accounts']));
  // @ts-expect-error Undeclared atom subscription key.
  Atom.withReactivity(['auth.user']);
  // @ts-expect-error Undeclared atom mutation key.
  Atom.runtime(Layer.empty).fn(() => Effect.void, { reactivityKeys: ['auth.session'] });
});

it('rejects record IDs for the collection-only keys', () => {
  // @ts-expect-error Account IDs have not been modeled as reactivity keys.
  Reactivity.invalidate({ account: ['account-id'] });
  // @ts-expect-error User IDs have not been modeled as reactivity keys.
  Reactivity.invalidate({ 'auth.users': ['user-id'] });
  // @ts-expect-error Session IDs have not been modeled as reactivity keys.
  Reactivity.invalidate({ 'auth.sessions': [1] });
  // @ts-expect-error Library IDs have not been modeled as reactivity keys.
  Reactivity.invalidate({ library: [1] });
  // @ts-expect-error Captured-service inputs must also reject record IDs.
  ({ account: ['account-id'] }) satisfies Reactivity.KeysInput;
  // @ts-expect-error Atom subscriptions must also reject record IDs.
  Atom.withReactivity({ 'auth.users': ['user-id'] });
  // @ts-expect-error Atom mutation options must also reject record IDs.
  Atom.runtime(Layer.empty).fn(() => Effect.void, { reactivityKeys: { 'auth.sessions': [1] } });
});
