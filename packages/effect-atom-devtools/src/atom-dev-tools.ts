import { Context, Effect, Layer, Match, PubSub, Queue, Schema, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { StatesTypeId, hasPredefinedStates, isInternal } from '#src/state.ts';

const TypeId = '@repo/atom-devtools-core/AtomDevTools' as const;

export const AtomId = Schema.String.pipe(Schema.brand(`${TypeId}/AtomId`));
export type AtomId = typeof AtomId.Type;

export class AtomSummary extends Schema.Class<AtomSummary, { readonly brand: unique symbol }>(
  `${TypeId}/AtomSummary`
)({
  id: AtomId,
  name: Schema.String,
  writable: Schema.Boolean,
}) {}

export class AtomLink extends Schema.Class<AtomLink, { readonly brand: unique symbol }>(
  `${TypeId}/AtomLink`
)({
  id: AtomId,
  name: Schema.String,
}) {}

export class AtomSnapshot extends AtomSummary.extend<
  AtomSnapshot,
  Record<never, never>,
  { readonly atomSnapshotBrand: unique symbol }
>(`${TypeId}/AtomSnapshot`)({
  value: Schema.Unknown,
  source: Schema.optional(Schema.String),
  keepAlive: Schema.Boolean,
  lazy: Schema.Boolean,
  idleTTL: Schema.optional(Schema.Number),
  subscriberCount: Schema.Number,
  dependencies: Schema.Array(AtomLink),
  dependents: Schema.Array(AtomLink),
  states: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      description: Schema.optional(Schema.String),
    })
  ),
  activeStateId: Schema.optional(Schema.String),
}) {}

export class Refresh extends Schema.TaggedClass<Refresh, { readonly brand: unique symbol }>(
  `${TypeId}/Command/Refresh`
)('Refresh', {
  atomId: AtomId,
}) {}

export class ActivateState extends Schema.TaggedClass<
  ActivateState,
  { readonly brand: unique symbol }
>(`${TypeId}/Command/ActivateState`)('ActivateState', {
  atomId: AtomId,
  stateId: Schema.String,
}) {}

export class ClearState extends Schema.TaggedClass<ClearState, { readonly brand: unique symbol }>(
  `${TypeId}/Command/ClearState`
)('ClearState', { atomId: AtomId }) {}

export class ClearAllStates extends Schema.TaggedClass<
  ClearAllStates,
  { readonly brand: unique symbol }
>(`${TypeId}/Command/ClearAllStates`)('ClearAllStates', {}) {}

export class AtomNotFound extends Schema.TaggedErrorClass<
  AtomNotFound,
  { readonly brand: unique symbol }
>(`${TypeId}/AtomNotFound`)('AtomNotFound', {
  id: AtomId,
}) {}

export class StateNotFound extends Schema.TaggedErrorClass<
  StateNotFound,
  { readonly brand: unique symbol }
>(`${TypeId}/StateNotFound`)('StateNotFound', {
  atomId: AtomId,
  stateId: Schema.String,
}) {}

interface TrackedNode {
  readonly node: AtomRegistry.Node<unknown>;
  devtoolListenerCount: number;
}

class CatalogAdded extends Schema.TaggedClass<CatalogAdded, { readonly brand: unique symbol }>(
  `${TypeId}/CatalogEvent/Added`
)('Added', { summary: AtomSummary }) {}

class CatalogRemoved extends Schema.TaggedClass<CatalogRemoved, { readonly brand: unique symbol }>(
  `${TypeId}/CatalogEvent/Removed`
)('Removed', { id: AtomId }) {}

const updateCatalog = (
  state: ReadonlyMap<AtomId, AtomSummary>,
  event: CatalogAdded | CatalogRemoved
) => {
  const next = new Map(state);
  if (event._tag === 'Added') {
    next.set(event.summary.id, event.summary);
  } else {
    next.delete(event.id);
  }
  return next;
};

export class AtomDevTools extends Context.Service<AtomDevTools>()(TypeId, {
  make: Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    const catalogEvents = yield* PubSub.unbounded<CatalogAdded | CatalogRemoved>();
    const nodesById = new Map<AtomId, TrackedNode>();
    const runtimeIdsByAtom = new WeakMap<Atom.Atom<unknown>, AtomId>();

    let nextRuntimeId = 0;
    const atomId = (atom: Atom.Atom<unknown>) => {
      if (Atom.isSerializable(atom)) {
        return AtomId.make(`serializable:${atom[Atom.SerializableTypeId].key}`);
      }
      const existing = runtimeIdsByAtom.get(atom);
      if (existing !== void 0) {
        return existing;
      }
      nextRuntimeId += 1;
      const id = AtomId.make(`runtime:${nextRuntimeId}`);
      runtimeIdsByAtom.set(atom, id);
      return id;
    };

    const atomName = (atom: Atom.Atom<unknown>) => atom.label?.[0] ?? atomId(atom);

    const summary = (node: AtomRegistry.Node<unknown>) =>
      new AtomSummary({
        id: atomId(node.atom),
        name: atomName(node.atom),
        writable: Atom.isWritable(node.atom),
      });

    const addNode = (node: AtomRegistry.Node<unknown>, publish: boolean) => {
      if (isInternal(node.atom)) {
        return;
      }
      const id = atomId(node.atom);
      if (nodesById.get(id)?.node === node) {
        return;
      }
      nodesById.set(id, { node, devtoolListenerCount: 0 });
      if (publish) {
        PubSub.publishUnsafe(catalogEvents, new CatalogAdded({ summary: summary(node) }));
      }
    };

    const removeNode = (node: AtomRegistry.Node<unknown>) => {
      if (isInternal(node.atom)) {
        return;
      }
      const id = atomId(node.atom);
      if (nodesById.get(id)?.node !== node) {
        return;
      }
      nodesById.delete(id);
      PubSub.publishUnsafe(catalogEvents, new CatalogRemoved({ id }));
    };

    for (const node of registry.getNodes().values()) {
      addNode(node, false);
    }

    const previousOnNodeAdded = registry.onNodeAdded;
    const previousOnNodeRemoved = registry.onNodeRemoved;
    const onNodeAdded = (node: AtomRegistry.Node<unknown>) => {
      try {
        previousOnNodeAdded?.(node);
      } finally {
        addNode(node, true);
      }
    };
    const onNodeRemoved = (node: AtomRegistry.Node<unknown>) => {
      try {
        previousOnNodeRemoved?.(node);
      } finally {
        removeNode(node);
      }
    };
    registry.onNodeAdded = onNodeAdded;
    registry.onNodeRemoved = onNodeRemoved;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        registry.onNodeAdded = previousOnNodeAdded;
        registry.onNodeRemoved = previousOnNodeRemoved;
      }).pipe(Effect.andThen(PubSub.shutdown(catalogEvents)))
    );

    const getNode = Effect.fnUntraced(function* (id: AtomId) {
      const tracked = nodesById.get(id);
      if (tracked === void 0) {
        return yield* new AtomNotFound({ id });
      }
      return tracked;
    });

    const link = (node: AtomRegistry.Node<unknown>) =>
      new AtomLink({
        id: atomId(node.atom),
        name: atomName(node.atom),
      });

    const snapshot = ({ devtoolListenerCount, node }: TrackedNode) => {
      const { atom } = node;
      const { id, name, writable } = summary(node);
      return new AtomSnapshot({
        id,
        name,
        writable,
        value: node.value(),
        source: atom.label?.[1],
        keepAlive: atom.keepAlive,
        lazy: atom.lazy,
        idleTTL: atom.idleTTL,
        subscriberCount: Math.max(0, node.listeners.size - devtoolListenerCount),
        dependencies: [...node.parents].filter((parent) => !isInternal(parent.atom)).map(link),
        dependents: [...node.children].filter((child) => !isInternal(child.atom)).map(link),
        states: hasPredefinedStates(atom) ? atom[StatesTypeId].states() : [],
        activeStateId: hasPredefinedStates(atom) ? atom[StatesTypeId].active(registry) : void 0,
      });
    };

    return {
      catalog: Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before taking the snapshot: additions and removals that
          // happen after the snapshot are already queued for this subscriber.
          const subscription = yield* PubSub.subscribe(catalogEvents);
          const initial = new Map(
            [...nodesById.entries()].map(([id, { node }]) => [id, summary(node)])
          ) as ReadonlyMap<AtomId, AtomSummary>;
          const updates = Stream.fromSubscription(subscription).pipe(
            Stream.mapAccum(
              () => initial,
              (state, event) => {
                const next = updateCatalog(state, event);
                return [next, [[...next.values()]]];
              }
            )
          );
          return Stream.concat(Stream.succeed([...initial.values()]), updates);
        })
      ),
      watch: (id: AtomId) =>
        Stream.unwrap(
          getNode(id).pipe(
            Effect.map((tracked) =>
              Stream.callback<AtomSnapshot>((queue) =>
                Effect.sync(() => {
                  let watched = tracked;
                  const cancel = registry.subscribe(tracked.node.atom, () => {
                    Queue.offerUnsafe(queue, snapshot(watched));
                  });
                  // The node may have reached its idle-removal task between
                  // resolving the id and starting this callback fiber. subscribe
                  // recreates it in that case, so use the newly tracked node.
                  watched = nodesById.get(id) ?? tracked;
                  watched.devtoolListenerCount += 1;
                  Queue.offerUnsafe(queue, snapshot(watched));
                  return { cancel, tracked: watched };
                }).pipe(
                  Effect.tap(({ cancel, tracked: subscribed }) =>
                    Effect.addFinalizer(() =>
                      Effect.sync(() => {
                        cancel();
                        subscribed.devtoolListenerCount = Math.max(
                          0,
                          subscribed.devtoolListenerCount - 1
                        );
                      })
                    )
                  )
                )
              )
            )
          )
        ),
      execute: Match.typeTags<
        Refresh | ActivateState | ClearState | ClearAllStates,
        Effect.Effect<void, AtomNotFound | StateNotFound>
      >()({
        ActivateState: Effect.fnUntraced(function* (command: ActivateState) {
          const {
            node: { atom },
          } = yield* getNode(command.atomId);
          if (!hasPredefinedStates(atom)) {
            return yield* new StateNotFound({ atomId: command.atomId, stateId: command.stateId });
          }
          const state = atom[StatesTypeId].states().find(({ id }) => id === command.stateId);
          if (state === void 0) {
            return yield* new StateNotFound({ atomId: command.atomId, stateId: command.stateId });
          }
          atom[StatesTypeId].activate(registry, state);
          return void 0;
        }),
        ClearAllStates: Effect.fnUntraced(function* (_command: ClearAllStates) {
          yield* Effect.sync(() => {
            for (const { node } of nodesById.values()) {
              const { atom } = node;
              if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
                atom[StatesTypeId].clear(registry);
              }
            }
          });
        }),
        ClearState: Effect.fnUntraced(function* (command: ClearState) {
          const {
            node: { atom },
          } = yield* getNode(command.atomId);
          if (hasPredefinedStates(atom)) {
            atom[StatesTypeId].clear(registry);
          }
        }),
        Refresh: Effect.fnUntraced(function* (command: Refresh) {
          const {
            node: { atom },
          } = yield* getNode(command.atomId);
          if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
            atom[StatesTypeId].refresh(registry);
          } else {
            registry.refresh(atom);
          }
        }),
      }),
    };
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make);
}
