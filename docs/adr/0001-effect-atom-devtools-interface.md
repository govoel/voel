# ADR-0001: Effect Atom devtools interface

## Status

Proposed

## Context

Voel needs a small, in-app devtool for Effect v4 Atoms. The inspection core must
not depend on React or React Native. The first UI will be React Native and should
consume the core through Effect primitives.

The primary feature is a Storybook-like list of predefined values for an atom.
An atom must become discoverable because the application used it in the inspected
`AtomRegistry`, not because it was also registered with the devtool.

This design targets Effect `4.0.0-beta.102`.

## Relevant Effect behavior

The current reactivity implementation gives the core most inspection data without
instrumenting atom reads:

- `AtomRegistry.getNodes()` exposes the live nodes in a registry.
- `AtomRegistry.onNodeAdded` and `onNodeRemoved` expose node lifecycle events.
- A node exposes its atom, current lifecycle state, dependencies (`parents`),
  dependents (`children`), and listeners.
- An atom exposes its label and source stack, equality/laziness/cache metadata,
  writable marker, and optional serialization key.
- `AtomRegistry.subscribe`, `refresh`, and the node graph provide live values and
  refresh behavior.
- `AsyncResult.isAsyncResult` exposes `Initial`, `Success`, `Failure`, and
  `waiting` without atom-specific configuration.

These APIs are in
`.repos/effect/packages/effect/src/unstable/reactivity/AtomRegistry.ts` and
`Atom.ts`.

There is one important gap: the public `Node` and `AtomRegistry` interfaces do
not allow replacing the read value of an arbitrary read-only atom. Calling
`AtomRegistry.set` is not a substitute because a writable atom's read type `R`
and write input `W` can differ. The predefined-state feature therefore must not
depend on `(registry as any).ensureNode(...).setValue(...)`.

## Decision

Build two layers:

1. `@repo/atom-devtools-core` owns state metadata, registry discovery, snapshots,
   and commands. It depends only on `effect`.
2. The React Native adapter turns core streams and commands into UI atoms. It
   depends on the core and `@effect/atom-react`.

The core will use a scoped Effect service. Its query surface is `Stream`, and its
command surface is `Effect`.

### Predefined state API

Predefined states contain the atom's complete read value. For an asynchronous
atom this means an `AsyncResult`, so loading, refreshing, success, and failure are
ordinary fixture values.

```ts
import type { Atom, AtomRegistry } from 'effect/unstable/reactivity';

export const StatesTypeId: unique symbol;

export interface PredefinedState<A> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly value: () => A;
}

export interface HasPredefinedStates<A> {
  readonly [StatesTypeId]: {
    readonly states: () => ReadonlyArray<PredefinedState<A>>;
    /** Internal implementation detail used by the core commands. */
    readonly activate: (registry: AtomRegistry.AtomRegistry, state: PredefinedState<A>) => void;
    /** Internal implementation detail used by the core commands. */
    readonly clear: (registry: AtomRegistry.AtomRegistry) => void;
    readonly active: (registry: AtomRegistry.AtomRegistry) => string | undefined;
  };
}

export const hasPredefinedStates: <A>(
  atom: Atom.Atom<A>
) => atom is Atom.Atom<A> & HasPredefinedStates<A>;

export interface WithStates {
  <T extends Atom.Atom<any>>(
    atom: T,
    states: () => ReadonlyArray<PredefinedState<Atom.Type<T>>>
  ): T;
}

export const makeWithStates: (options: { readonly enabled: boolean }) => WithStates;
```

The application configures the function once in its own devtool module:

```ts
import * as AtomDevTools from '@repo/atom-devtools-core/State';

export const withStates = AtomDevTools.makeWithStates({ enabled: __DEV__ });
```

When enabled, `withStates` returns an atom with symbol metadata, in the same
style as `Atom.serializable` and `Atom.withLabel`. This is not registration; the
registry remains the only source of discovered atoms.

The enabled atom is a shallow wrapper backed by a private
`Atom.Writable<Option<ActiveState<A>>>`:

- with no active state, its `read` calls the original `read` with the same
  `AtomContext`;
- with an active state, its `read` returns the fixture value and stops reading
  the original dependencies;
- writes still run the original atom's `write` function;
- activating or clearing a state writes the private override atom, naturally
  invalidating the public atom and all of its dependents.

When disabled, the configured function is an identity operation equivalent to:

```ts
const withStates = <T extends Atom.Atom<any>>(
  atom: T,
  _states: () => ReadonlyArray<PredefinedState<Atom.Type<T>>>
): T => atom;
```

This uses only public Atom behavior. It also ensures that an in-flight Effect or
Stream owned by the original read is finalized when an override becomes active,
so it cannot race and replace the fixture value.

`withStates` should be the last structural atom combinator. Metadata-only native
combinators such as `Atom.withLabel` and `Atom.withEquality` copy symbol metadata,
but a later `Atom.map` or `Atom.transform` creates a different atom and should
have its own states.

Example:

```ts
import { Cause } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { withStates } from './devtools';

const accountsBase = AppRuntime.atom(loadAccounts).pipe(Atom.withLabel('Accounts'));

export const accountsAtom = AtomDevTools.withStates(accountsBase, () => [
  {
    id: 'loading',
    label: 'Loading',
    value: () => AsyncResult.initial(true),
  },
  {
    id: 'empty',
    label: 'Empty',
    value: () => AsyncResult.success([]),
  },
  {
    id: 'failure',
    label: 'Failure',
    value: () => AsyncResult.failure(Cause.die(new Error('Fixture failure'))),
  },
]);
```

Fixture factories are synchronous and lazy. Selecting a state evaluates the
factory inside `Effect.try`, so a bad fixture is reported to the UI rather than
crashing an event handler. Effectful scenarios that modify several atoms are out
of scope for the first interface and can be added later as a separate concept.

### Production behavior

The application does not need conditional assignments for each atom. In
production, the configured `withStates` returns the exact input atom. It does not
create metadata, a wrapper, an override atom, a registry dependency, or a read
check. The state collection thunk is accepted but never evaluated, so its array,
records, and individual value factories are not constructed.

The remaining runtime cost is one shared configuration call, one identity call
per decorated atom, and allocation of each state collection thunk. The package
and thunk bodies can still occupy bundle space.

With a production transform that replaces `__DEV__` and dead-code elimination,
the configured implementation and thunk bodies may also be removed when the
bundler can prove they are unused. The core package should declare itself
side-effect-free. If Metro cannot prove that removal, a build-time alias or
transform is required; no runtime API can guarantee that a module is absent from
a bundle.

### Core service API

```ts
import { Context, Schema } from 'effect';
import type { Effect, Layer, Stream } from 'effect';
import type { AtomRegistry } from 'effect/unstable/reactivity';

export type AtomId = string;

export interface AtomSummary {
  readonly id: AtomId;
  readonly name: string;
  readonly writable: boolean;
  readonly serializableKey?: string;
  readonly nodeState: 'uninitialized' | 'stale' | 'valid';
  readonly stateCount: number;
}

export interface AtomLink {
  readonly id: AtomId;
  readonly name: string;
}

export interface AsyncResultSnapshot {
  readonly tag: 'Initial' | 'Success' | 'Failure';
  readonly waiting: boolean;
}

export interface AtomSnapshot extends AtomSummary {
  readonly value: unknown;
  readonly valuePreview: string;
  readonly source?: string;
  readonly keepAlive: boolean;
  readonly lazy: boolean;
  readonly idleTTL?: number;
  readonly subscriberCount: number;
  readonly dependencies: ReadonlyArray<AtomLink>;
  readonly dependents: ReadonlyArray<AtomLink>;
  readonly states: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly description?: string;
  }>;
  readonly activeStateId?: string;
  readonly asyncResult?: AsyncResultSnapshot;
}

export type Command =
  | { readonly _tag: 'Refresh'; readonly atomId: AtomId }
  | { readonly _tag: 'ActivateState'; readonly atomId: AtomId; readonly stateId: string }
  | { readonly _tag: 'ClearState'; readonly atomId: AtomId }
  | { readonly _tag: 'ClearAllStates' };

export class AtomNotFound extends Schema.TaggedErrorClass<AtomNotFound>()('AtomNotFound', {
  id: Schema.String,
}) {}

export class StateNotFound extends Schema.TaggedErrorClass<StateNotFound>()('StateNotFound', {
  atomId: Schema.String,
  stateId: Schema.String,
}) {}

export class StateEvaluationError extends Schema.TaggedErrorClass<StateEvaluationError>()(
  'StateEvaluationError',
  { atomId: Schema.String, stateId: Schema.String, cause: Schema.Defect() }
) {}

export type CommandError = AtomNotFound | StateNotFound | StateEvaluationError;

export class AtomDevTools extends Context.Service<
  AtomDevTools,
  {
    /** Emits an initial catalog and a new catalog after node additions/removals. */
    readonly catalog: Stream.Stream<ReadonlyArray<AtomSummary>>;

    /** Takes one non-subscribing snapshot of a currently live node. */
    readonly inspect: (id: AtomId) => Effect.Effect<AtomSnapshot, AtomNotFound>;

    /**
     * Emits immediately and after value changes. The node is mounted for the
     * stream's scoped lifetime.
     */
    readonly watch: (id: AtomId) => Stream.Stream<AtomSnapshot, AtomNotFound>;

    readonly execute: (command: Command) => Effect.Effect<void, CommandError>;
  }
>()('@repo/atom-devtools-core/AtomDevTools') {
  static readonly layer: Layer.Layer<AtomDevTools, never, AtomRegistry.AtomRegistry>;
  static readonly layerRegistry: (registry: AtomRegistry.AtomRegistry) => Layer.Layer<AtomDevTools>;
}
```

The concrete implementation will use `Inspectable.toStringUnknown` for
`valuePreview` and retain the raw in-process value for richer future renderers.
Preview length should be configurable and bounded.

### Discovery and identity

When its layer is acquired, the service will:

1. inspect all existing entries in `registry.getNodes()`;
2. chain, rather than replace, existing `onNodeAdded` and `onNodeRemoved`
   callbacks;
3. publish deduplicated lifecycle events through a `PubSub`;
4. restore the previous callbacks when its scope closes.

Add events must be deduplicated by node/atom identity. Consumers cannot assume
the registry invokes an addition hook exactly once.

A serializable atom gets `serializable:<key>` as its id. Other atoms receive a
stable `runtime:<counter>` id from a service-local `WeakMap`. Labels are display
names, not identities, because labels need not be unique.

The catalog contains live registry nodes only. "Automatic discovery" therefore
means runtime discovery: an atom that has never been read, mounted, subscribed,
or used as a dependency cannot be discovered by inspecting an `AtomRegistry`.
This limitation avoids a second global registration mechanism.

### Observation semantics

The service does not subscribe to every discovered atom. Doing so would make all
atoms mounted, prevent normal idle removal, and eagerly run lazy Effects and
Streams. `catalog` reacts only to additions and removals. `inspect` observes once,
and `watch` subscribes only while a detail UI is open.

Because `watch` is itself a registry listener, `subscriberCount` subtracts
listeners owned by the devtool. Selecting an atom can still initialize a stale
node; that is an inherent consequence of requesting its current value.

The names `dependencies` and `dependents` deliberately replace the registry's
internal `parents` and `children` terminology in the UI model.

### React Native adapter

The adapter is intentionally thin:

- one UI atom consumes `AtomDevTools.catalog`;
- an `Atom.family` consumes `AtomDevTools.watch(id)` for the selected row;
- an `Atom.fn` executes `AtomDevTools.execute(command)`;
- adapter-owned atoms are marked internal and filtered from the inspected
  catalog, or are hosted in a separate UI registry.

This keeps React hooks, navigation, sheets, and native controls out of the core.
The first UI only needs an atom list, a detail/value preview, predefined-state
buttons, Clear, and Refresh.

## Functionality included at minimal cost

The first implementation should include:

- automatic live-node discovery and search by native atom label;
- raw value and safe text preview;
- `AsyncResult` tag and waiting status;
- readable versus writable status;
- source location from `Atom.withLabel`;
- lifecycle, keep-alive, lazy, idle TTL, and application subscriber count;
- dependency and dependent links;
- refresh;
- activate one predefined state, clear it, or clear all active states.

Arbitrary value editing, time travel, persistence, remote transport, and
multi-atom scenarios are not part of the minimal core. In particular, arbitrary
editing cannot be made type-safe from `Atom.Writable<R, W>` metadata because the
runtime does not expose a schema for `W`.

## Consequences

- No explicit atom registration API is introduced.
- Atoms with states have one small private dependency and should only include
  fixture data in development builds.
- Predefined values work for read-only, Effect-backed, Stream-backed, derived,
  and writable atoms without using private registry methods.
- The devtool sees only atoms that participate in the inspected registry's
  runtime graph.
- The core remains usable by a terminal, web, or remote UI without importing
  React Native.
