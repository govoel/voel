import { Cause, Context, Effect, Inspectable, Layer, PubSub, Queue, Schema, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { StatesTypeId, hasPredefinedStates, isInternal, markInternal } from '#src/state.ts';

const TypeId = '@repo/effect-atom-devtools-core/AtomDevTools' as const;

export const AtomId = Schema.String.pipe(Schema.brand(`${TypeId}/AtomId`));
export type AtomId = typeof AtomId.Type;

export class AtomSummary extends Schema.Class<AtomSummary, { readonly brand: unique symbol }>(
  `${TypeId}/AtomSummary`
)({
  id: AtomId,
  name: Schema.String,
  writable: Schema.Boolean,
  overridden: Schema.Boolean,
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
  value: Schema.String,
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
  readonly observation: Atom.Atom<NodeObservation>;
  readonly watchers: Set<SnapshotWatcher>;
}

interface SnapshotWatcher {
  readonly fail: (error: AtomNotFound) => void;
}

interface NodeObservation {
  readonly value: unknown;
  readonly activeStateId: string | undefined;
}

export class AtomDevTools extends Context.Service<AtomDevTools>()(TypeId, {
  make: Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    const catalogSnapshots = yield* PubSub.unbounded<readonly AtomSummary[]>({ replay: 1 });
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
        overridden:
          hasPredefinedStates(node.atom) && node.atom[StatesTypeId].active(registry) !== void 0,
      });

    const publishCatalog = () => {
      PubSub.publishUnsafe(
        catalogSnapshots,
        [...nodesById.values()].map(({ node }) => summary(node))
      );
    };

    const observe = (node: AtomRegistry.Node<unknown>) => {
      const { atom } = node;
      return markInternal(
        Atom.make(
          (context): NodeObservation => ({
            value: context(atom),
            activeStateId: hasPredefinedStates(atom)
              ? atom[StatesTypeId].activeInContext(context)
              : void 0,
          })
        ).pipe(
          Atom.withEquality<NodeObservation>(
            (current, next) =>
              atom.equals(current.value, next.value) && current.activeStateId === next.activeStateId
          )
        )
      );
    };

    const addNode = (node: AtomRegistry.Node<unknown>, publish: boolean) => {
      if (isInternal(node.atom)) {
        return;
      }
      const id = atomId(node.atom);
      if (nodesById.get(id)?.node === node) {
        return;
      }
      nodesById.set(id, {
        node,
        observation: observe(node),
        watchers: new Set(),
      });
      if (publish) {
        publishCatalog();
      }
    };

    const removeNode = (node: AtomRegistry.Node<unknown>) => {
      if (isInternal(node.atom)) {
        return;
      }
      const id = atomId(node.atom);
      const tracked = nodesById.get(id);
      if (tracked === void 0 || tracked.node !== node) {
        return;
      }
      nodesById.delete(id);
      const error = new AtomNotFound({ id });
      for (const watcher of tracked.watchers) {
        watcher.fail(error);
      }
      tracked.watchers.clear();
      publishCatalog();
    };

    for (const node of registry.getNodes().values()) {
      addNode(node, false);
    }
    publishCatalog();

    const previousOnNodeAdded = registry.onNodeAdded;
    const previousOnNodeRemoved = registry.onNodeRemoved;
    let handleNodeAdded: ((node: AtomRegistry.Node<unknown>) => void) | undefined = (node) => {
      addNode(node, true);
    };
    let handleNodeRemoved: ((node: AtomRegistry.Node<unknown>) => void) | undefined = removeNode;
    const onNodeAdded = (node: AtomRegistry.Node<unknown>) => {
      try {
        previousOnNodeAdded?.(node);
      } finally {
        handleNodeAdded?.(node);
      }
    };
    const onNodeRemoved = (node: AtomRegistry.Node<unknown>) => {
      try {
        previousOnNodeRemoved?.(node);
      } finally {
        handleNodeRemoved?.(node);
      }
    };
    registry.onNodeAdded = onNodeAdded;
    registry.onNodeRemoved = onNodeRemoved;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        handleNodeAdded = void 0;
        handleNodeRemoved = void 0;
        if (registry.onNodeAdded === onNodeAdded) {
          registry.onNodeAdded = previousOnNodeAdded;
        }
        if (registry.onNodeRemoved === onNodeRemoved) {
          registry.onNodeRemoved = previousOnNodeRemoved;
        }
      }).pipe(Effect.andThen(PubSub.shutdown(catalogSnapshots)))
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

    const snapshot = ({ node }: TrackedNode) => {
      const { atom } = node;
      const { id, name, overridden, writable } = summary(node);
      return new AtomSnapshot({
        id,
        name,
        overridden,
        writable,
        value: Inspectable.toStringUnknown(node.value()),
        source: atom.label?.[1],
        keepAlive: atom.keepAlive,
        lazy: atom.lazy,
        idleTTL: atom.idleTTL,
        subscriberCount: node.listeners.size,
        dependencies: [...node.parents].filter((parent) => !isInternal(parent.atom)).map(link),
        dependents: [...node.children].filter((child) => !isInternal(child.atom)).map(link),
        states: hasPredefinedStates(atom) ? atom[StatesTypeId].states() : [],
        activeStateId: hasPredefinedStates(atom) ? atom[StatesTypeId].active(registry) : void 0,
      });
    };

    return {
      catalog: Stream.fromPubSub(catalogSnapshots),
      watch: (id: AtomId) =>
        Stream.unwrap(
          getNode(id).pipe(
            Effect.map((tracked) =>
              Stream.callback<AtomSnapshot, AtomNotFound>((queue) =>
                Effect.acquireRelease(
                  Effect.sync(() => {
                    let watched = tracked;
                    const watcher: SnapshotWatcher = {
                      fail: (error) => {
                        Queue.failCauseUnsafe(queue, Cause.fail(error));
                      },
                    };
                    const cancel = registry.subscribe(
                      tracked.observation,
                      () => {
                        watched = nodesById.get(id) ?? watched;
                        Queue.offerUnsafe(queue, snapshot(watched));
                      },
                      { immediate: true }
                    );
                    // The node may have reached its idle-removal task between
                    // resolving the id and subscribing. Reading the observation
                    // recreates it before invoking the immediate listener.
                    watched = nodesById.get(id) ?? watched;
                    watched.watchers.add(watcher);
                    return { cancel, watched, watcher };
                  }),
                  ({ cancel, watched, watcher }) =>
                    Effect.sync(() => {
                      watched.watchers.delete(watcher);
                      cancel();
                    })
                )
              )
            )
          )
        ),
      activateState: Effect.fnUntraced(function* (
        targetId: AtomId,
        stateId: string
      ): Effect.fn.Return<void, AtomNotFound | StateNotFound> {
        const {
          node: { atom },
        } = yield* getNode(targetId);
        if (!hasPredefinedStates(atom)) {
          return yield* new StateNotFound({ atomId: targetId, stateId });
        }
        const state = atom[StatesTypeId].states().find(({ id }) => id === stateId);
        if (state === void 0) {
          return yield* new StateNotFound({ atomId: targetId, stateId });
        }
        atom[StatesTypeId].activate(registry, state);
        publishCatalog();
        return void 0;
      }),
      clearAllStates: Effect.fnUntraced(function* (): Effect.fn.Return<void> {
        yield* Effect.sync(() => {
          for (const { node } of nodesById.values()) {
            const { atom } = node;
            if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
              atom[StatesTypeId].clear(registry);
            }
          }
          publishCatalog();
        });
      }),
      clearState: Effect.fnUntraced(function* (
        targetId: AtomId
      ): Effect.fn.Return<void, AtomNotFound> {
        const {
          node: { atom },
        } = yield* getNode(targetId);
        if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
          atom[StatesTypeId].clear(registry);
          publishCatalog();
        }
      }),
      refresh: Effect.fnUntraced(function* (
        targetId: AtomId
      ): Effect.fn.Return<void, AtomNotFound> {
        const {
          node: { atom },
        } = yield* getNode(targetId);
        if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
          atom[StatesTypeId].refresh(registry);
        } else {
          registry.refresh(atom);
        }
      }),
    };
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make);
}
