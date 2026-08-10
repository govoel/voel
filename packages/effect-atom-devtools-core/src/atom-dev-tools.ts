import {
  Cause,
  Context,
  Effect,
  Equal,
  Inspectable,
  Layer,
  Option,
  PubSub,
  Queue,
  Schema,
  Stream,
} from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import {
  PredefinedStatesTypeId,
  hasPredefinedStates,
  isInternalAtom,
  markInternalAtom,
} from '#src/predefined-states.ts';

export const AtomDevToolsTypeId = '@repo/effect-atom-devtools-core/AtomDevTools' as const;

export const AtomId = Schema.String.pipe(Schema.brand(`${AtomDevToolsTypeId}/AtomId`));
export type AtomId = typeof AtomId.Type;

export class AtomSummary extends Schema.Class<AtomSummary, { readonly brand: unique symbol }>(
  `${AtomDevToolsTypeId}/AtomSummary`
)({
  id: AtomId,
  name: Schema.String,
  writable: Schema.Boolean,
  hasActivePredefinedState: Schema.Boolean,
}) {}

class AtomLink extends Schema.Class<AtomLink, { readonly brand: unique symbol }>(
  `${AtomDevToolsTypeId}/AtomLink`
)({
  id: AtomId,
  name: Schema.String,
}) {}

export class AtomSnapshot extends AtomSummary.extend<
  AtomSnapshot,
  Record<never, never>,
  { readonly atomSnapshotBrand: unique symbol }
>(`${AtomDevToolsTypeId}/AtomSnapshot`)({
  value: Schema.String,
  source: Schema.optional(Schema.String),
  keepAlive: Schema.Boolean,
  lazy: Schema.Boolean,
  idleTTL: Schema.optional(Schema.Number),
  subscriberCount: Schema.Number,
  dependencies: Schema.Array(AtomLink),
  dependents: Schema.Array(AtomLink),
  predefinedStates: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      description: Schema.optional(Schema.String),
    })
  ),
  activePredefinedStateId: Schema.Option(Schema.String),
}) {}

export class AtomNotFound extends Schema.TaggedErrorClass<
  AtomNotFound,
  { readonly brand: unique symbol }
>(`${AtomDevToolsTypeId}/AtomNotFound`)('AtomNotFound', {
  id: AtomId,
}) {}

export class PredefinedStateNotFound extends Schema.TaggedErrorClass<
  PredefinedStateNotFound,
  { readonly brand: unique symbol }
>(`${AtomDevToolsTypeId}/PredefinedStateNotFound`)('PredefinedStateNotFound', {
  atomId: AtomId,
  stateId: Schema.String,
}) {}

interface TrackedNode {
  readonly node: AtomRegistry.Node<unknown>;
  readonly observation: Atom.Atom<NodeObservation>;
  readonly watchers: Set<{ readonly fail: (error: AtomNotFound) => void }>;
}

interface NodeObservation {
  readonly value: unknown;
  readonly activePredefinedStateId: Option.Option<string>;
}

export class AtomDevTools extends Context.Service<AtomDevTools>()(AtomDevToolsTypeId, {
  make: Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    const catalogPubSub = yield* PubSub.unbounded<readonly AtomSummary[]>({ replay: 1 });
    const trackedNodesById = new Map<AtomId, TrackedNode>();
    const runtimeIdsByAtom = new WeakMap<Atom.Atom<unknown>, AtomId>();

    let nextRuntimeId = 0;
    const getAtomId = (atom: Atom.Atom<unknown>) => {
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

    const getAtomName = (atom: Atom.Atom<unknown>) => atom.label?.[0] ?? getAtomId(atom);

    const makeAtomSummary = (node: AtomRegistry.Node<unknown>) =>
      new AtomSummary({
        id: getAtomId(node.atom),
        name: getAtomName(node.atom),
        writable: Atom.isWritable(node.atom),
        hasActivePredefinedState:
          hasPredefinedStates(node.atom) &&
          Option.isSome(node.atom[PredefinedStatesTypeId].getActiveStateId(registry)),
      });

    const publishCatalogSnapshot = () => {
      PubSub.publishUnsafe(
        catalogPubSub,
        [...trackedNodesById.values()].map(({ node }) => makeAtomSummary(node))
      );
    };

    const makeObservationAtom = (node: AtomRegistry.Node<unknown>) => {
      const { atom } = node;
      return markInternalAtom(
        Atom.make((get): NodeObservation => ({
          value: get(atom),
          activePredefinedStateId: hasPredefinedStates(atom)
            ? atom[PredefinedStatesTypeId].readActiveStateId(get)
            : Option.none(),
        })).pipe(
          Atom.withEquality<NodeObservation>(
            (current, next) =>
              atom.equals(current.value, next.value) &&
              Equal.equals(current.activePredefinedStateId, next.activePredefinedStateId)
          )
        )
      );
    };

    const failSnapshotWatchers = (id: AtomId, tracked: TrackedNode) => {
      const error = new AtomNotFound({ id });
      for (const watcher of tracked.watchers) {
        watcher.fail(error);
      }
      tracked.watchers.clear();
    };

    const trackNode = (node: AtomRegistry.Node<unknown>, publish: boolean) => {
      if (isInternalAtom(node.atom)) {
        return;
      }
      const id = getAtomId(node.atom);
      const existing = trackedNodesById.get(id);
      if (existing?.node === node) {
        return;
      }
      if (existing !== void 0) {
        failSnapshotWatchers(id, existing);
      }
      trackedNodesById.set(id, {
        node,
        observation: makeObservationAtom(node),
        watchers: new Set(),
      });
      if (publish) {
        publishCatalogSnapshot();
      }
    };

    const untrackNode = (node: AtomRegistry.Node<unknown>) => {
      if (isInternalAtom(node.atom)) {
        return;
      }
      const id = getAtomId(node.atom);
      const tracked = trackedNodesById.get(id);
      if (tracked === void 0 || tracked.node !== node) {
        return;
      }
      trackedNodesById.delete(id);
      failSnapshotWatchers(id, tracked);
      publishCatalogSnapshot();
    };

    for (const node of registry.getNodes().values()) {
      trackNode(node, false);
    }
    publishCatalogSnapshot();

    const previousOnNodeAdded = registry.onNodeAdded;
    const previousOnNodeRemoved = registry.onNodeRemoved;
    let handleNodeAdded: ((node: AtomRegistry.Node<unknown>) => void) | undefined = (node) => {
      trackNode(node, true);
    };
    let handleNodeRemoved: ((node: AtomRegistry.Node<unknown>) => void) | undefined = untrackNode;
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
      }).pipe(Effect.andThen(PubSub.shutdown(catalogPubSub)))
    );

    const getTrackedNode = Effect.fnUntraced(function* (id: AtomId) {
      const tracked = trackedNodesById.get(id);
      if (tracked === void 0) {
        return yield* new AtomNotFound({ id });
      }
      return tracked;
    });

    const makeAtomLink = (node: AtomRegistry.Node<unknown>) =>
      new AtomLink({
        id: getAtomId(node.atom),
        name: getAtomName(node.atom),
      });

    const makeAtomSnapshot = ({ node }: TrackedNode) => {
      const { atom } = node;
      const { id, name, hasActivePredefinedState, writable } = makeAtomSummary(node);
      return new AtomSnapshot({
        id,
        name,
        hasActivePredefinedState,
        writable,
        value: Inspectable.toStringUnknown(node.value()),
        source: atom.label?.[1],
        keepAlive: atom.keepAlive,
        lazy: atom.lazy,
        idleTTL: atom.idleTTL,
        subscriberCount: node.listeners.size,
        dependencies: [...node.parents]
          .filter((parent) => !isInternalAtom(parent.atom))
          .map(makeAtomLink),
        dependents: [...node.children]
          .filter((child) => !isInternalAtom(child.atom))
          .map(makeAtomLink),
        predefinedStates: hasPredefinedStates(atom) ? atom[PredefinedStatesTypeId].getStates() : [],
        activePredefinedStateId: hasPredefinedStates(atom)
          ? atom[PredefinedStatesTypeId].getActiveStateId(registry)
          : Option.none(),
      });
    };

    return {
      catalog: Stream.fromPubSub(catalogPubSub),
      watch: (id: AtomId) =>
        Stream.unwrap(
          getTrackedNode(id).pipe(
            Effect.map((tracked) =>
              Stream.callback<AtomSnapshot, AtomNotFound>((queue) =>
                Effect.acquireRelease(
                  Effect.sync(() => {
                    let watched = tracked;
                    const watcher = {
                      fail: (error: AtomNotFound) => {
                        Queue.failCauseUnsafe(queue, Cause.fail(error));
                      },
                    };
                    const cancel = registry.subscribe(
                      tracked.observation,
                      () => {
                        watched = trackedNodesById.get(id) ?? watched;
                        Queue.offerUnsafe(queue, makeAtomSnapshot(watched));
                      },
                      { immediate: true }
                    );
                    // The node may have reached its idle-removal task between
                    // resolving the id and subscribing. Reading the observation
                    // recreates it before invoking the immediate listener.
                    watched = trackedNodesById.get(id) ?? watched;
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
      activatePredefinedState: Effect.fnUntraced(function* (
        targetId: AtomId,
        stateId: string
      ): Effect.fn.Return<void, AtomNotFound | PredefinedStateNotFound> {
        const {
          node: { atom },
        } = yield* getTrackedNode(targetId);
        if (!hasPredefinedStates(atom)) {
          return yield* new PredefinedStateNotFound({ atomId: targetId, stateId });
        }
        const state = atom[PredefinedStatesTypeId].getStates().find(({ id }) => id === stateId);
        if (state === void 0) {
          return yield* new PredefinedStateNotFound({ atomId: targetId, stateId });
        }
        atom[PredefinedStatesTypeId].activate(registry, state);
        publishCatalogSnapshot();
        return void 0;
      }),
      clearAllPredefinedStates: Effect.fnUntraced(function* (): Effect.fn.Return<void> {
        yield* Effect.sync(() => {
          for (const { node } of trackedNodesById.values()) {
            const { atom } = node;
            if (
              hasPredefinedStates(atom) &&
              Option.isSome(atom[PredefinedStatesTypeId].getActiveStateId(registry))
            ) {
              atom[PredefinedStatesTypeId].clear(registry);
            }
          }
          publishCatalogSnapshot();
        });
      }),
      clearPredefinedState: Effect.fnUntraced(function* (
        targetId: AtomId
      ): Effect.fn.Return<void, AtomNotFound> {
        const {
          node: { atom },
        } = yield* getTrackedNode(targetId);
        if (
          hasPredefinedStates(atom) &&
          Option.isSome(atom[PredefinedStatesTypeId].getActiveStateId(registry))
        ) {
          atom[PredefinedStatesTypeId].clear(registry);
          publishCatalogSnapshot();
        }
      }),
      refresh: Effect.fnUntraced(function* (
        targetId: AtomId
      ): Effect.fn.Return<void, AtomNotFound> {
        const {
          node: { atom },
        } = yield* getTrackedNode(targetId);
        if (
          hasPredefinedStates(atom) &&
          Option.isSome(atom[PredefinedStatesTypeId].getActiveStateId(registry))
        ) {
          atom[PredefinedStatesTypeId].refresh(registry);
        } else {
          registry.refresh(atom);
        }
      }),
    };
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make);
}
