import { Context, Effect, Inspectable, Layer, Match, PubSub, Queue, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { StatesTypeId, hasPredefinedStates, isInternal } from './state.ts';

const TypeId = '@repo/atom-devtools-core/AtomDevTools' as const;

export const AtomId = Schema.String.pipe(Schema.brand(`${TypeId}/AtomId`));
export type AtomId = typeof AtomId.Type;

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
  readonly dependencies: readonly AtomLink[];
  readonly dependents: readonly AtomLink[];
  readonly states: readonly {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
  }[];
  readonly activeStateId?: string;
  readonly asyncResult?: AsyncResultSnapshot;
}

export class Refresh extends Schema.TaggedClass<Refresh>(`${TypeId}/Command/Refresh`)('Refresh', {
  atomId: AtomId,
}) {}

export class ActivateState extends Schema.TaggedClass<ActivateState>(
  `${TypeId}/Command/ActivateState`
)('ActivateState', {
  atomId: AtomId,
  stateId: Schema.String,
}) {}

export class ClearState extends Schema.TaggedClass<ClearState>(`${TypeId}/Command/ClearState`)(
  'ClearState',
  { atomId: AtomId }
) {}

export class ClearAllStates extends Schema.TaggedClass<ClearAllStates>(
  `${TypeId}/Command/ClearAllStates`
)('ClearAllStates', {}) {}

export type Command = Refresh | ActivateState | ClearState | ClearAllStates;

export class AtomNotFound extends Schema.TaggedErrorClass<AtomNotFound>(`${TypeId}/AtomNotFound`)(
  'AtomNotFound',
  {
    id: AtomId,
  }
) {}

export class StateNotFound extends Schema.TaggedErrorClass<StateNotFound>(
  `${TypeId}/StateNotFound`
)('StateNotFound', {
  atomId: AtomId,
  stateId: Schema.String,
}) {}

export type CommandError = AtomNotFound | StateNotFound;

export interface AtomDevToolsOptions {
  readonly previewLength?: number;
}

interface AtomDevToolsShape {
  readonly catalog: Stream.Stream<readonly AtomSummary[]>;
  readonly watch: (id: AtomId) => Stream.Stream<AtomSnapshot, AtomNotFound>;
  readonly execute: (command: Command) => Effect.Effect<void, CommandError>;
}

interface TrackedNode {
  readonly node: AtomRegistry.Node<unknown>;
  devtoolListenerCount: number;
}

const nodeState = (node: AtomRegistry.Node<unknown>): AtomSummary['nodeState'] => {
  const state = node.currentState();
  if (state === 'removed') {
    throw new Error('Cannot inspect a removed atom node');
  }
  return state;
};

const makeServiceRegistry = Effect.fn('AtomDevTools.makeServiceRegistry')(function* (
  registry: AtomRegistry.AtomRegistry
): Effect.fn.Return<AtomDevToolsShape, never, Scope.Scope> {
  const lifecycle = yield* PubSub.unbounded<number>({ replay: 1 });
  const nodesById = new Map<AtomId, TrackedNode>();
  const runtimeIdsByAtom = new WeakMap<Atom.Atom<unknown>, AtomId>();

  let lifecycleVersion = 0;
  const publishLifecycle = (): void => {
    lifecycleVersion += 1;
    PubSub.publishUnsafe(lifecycle, lifecycleVersion);
  };

  let nextRuntimeId = 0;
  const atomId = (atom: Atom.Atom<unknown>): AtomId => {
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

  const atomName = (atom: Atom.Atom<unknown>): string => atom.label?.[0] ?? atomId(atom);

  const addNode = (node: AtomRegistry.Node<unknown>, publish: boolean): void => {
    if (isInternal(node.atom)) {
      return;
    }
    const id = atomId(node.atom);
    if (nodesById.get(id)?.node === node) {
      return;
    }
    nodesById.set(id, { node, devtoolListenerCount: 0 });
    if (publish) {
      publishLifecycle();
    }
  };

  const removeNode = (node: AtomRegistry.Node<unknown>): void => {
    const id = atomId(node.atom);
    if (nodesById.get(id)?.node !== node) {
      return;
    }
    nodesById.delete(id);
    publishLifecycle();
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
    }).pipe(Effect.andThen(PubSub.shutdown(lifecycle)))
  );

  const getNode = Effect.fnUntraced(function* (id: AtomId) {
    const tracked = nodesById.get(id);
    if (tracked === void 0 || tracked.node.currentState() === 'removed') {
      return yield* new AtomNotFound({ id });
    }
    return tracked;
  });

  const summary = (node: AtomRegistry.Node<unknown>): AtomSummary => {
    const { atom } = node;
    const states = hasPredefinedStates(atom) ? atom[StatesTypeId].states() : [];
    return {
      id: atomId(atom),
      name: atomName(atom),
      writable: Atom.isWritable(atom),
      ...(Atom.isSerializable(atom) ? { serializableKey: atom[Atom.SerializableTypeId].key } : {}),
      nodeState: nodeState(node),
      stateCount: states.length,
    };
  };

  const link = (node: AtomRegistry.Node<unknown>): AtomLink => ({
    id: atomId(node.atom),
    name: atomName(node.atom),
  });

  const snapshot = ({ devtoolListenerCount, node }: TrackedNode): AtomSnapshot => {
    const { atom } = node;
    const value = node.value();
    const states = hasPredefinedStates(atom) ? atom[StatesTypeId].states() : [];
    const source = atom.label?.[1];
    const activeStateId = hasPredefinedStates(atom) ? atom[StatesTypeId].active(registry) : void 0;
    return {
      ...summary(node),
      value,
      valuePreview: Inspectable.toStringUnknown(value),
      ...(source === void 0 || source.length === 0 ? {} : { source }),
      keepAlive: atom.keepAlive,
      lazy: atom.lazy,
      ...(atom.idleTTL === void 0 ? {} : { idleTTL: atom.idleTTL }),
      subscriberCount: Math.max(0, node.listeners.size - devtoolListenerCount),
      dependencies: [...node.parents].filter((parent) => !isInternal(parent.atom)).map(link),
      dependents: [...node.children].filter((child) => !isInternal(child.atom)).map(link),
      states: states.map((state) => ({
        id: state.id,
        label: state.label,
        ...(state.description === void 0 ? {} : { description: state.description }),
      })),
      ...(activeStateId === void 0 ? {} : { activeStateId }),
      ...(AsyncResult.isAsyncResult(value)
        ? { asyncResult: { tag: value._tag, waiting: value.waiting } }
        : {}),
    };
  };

  const catalogSnapshot = (): readonly AtomSummary[] =>
    [...nodesById.values()].map(({ node }) => summary(node));
  const catalog = Stream.unwrap(
    Effect.sync(() => {
      const initialVersion = lifecycleVersion;
      const initialCatalog = catalogSnapshot();
      return Stream.concat(
        Stream.succeed(initialCatalog),
        Stream.fromPubSub(lifecycle).pipe(
          Stream.filter((version) => version > initialVersion),
          Stream.map(catalogSnapshot)
        )
      );
    })
  );

  const watch = (id: AtomId): Stream.Stream<AtomSnapshot, AtomNotFound> =>
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
    );

  const executeClearAllStates = Effect.fn('AtomDevTools.executeClearAllStates')(() =>
    Effect.sync(() => {
      for (const { node } of nodesById.values()) {
        const { atom } = node;
        if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
          atom[StatesTypeId].clear(registry);
        }
      }
    })
  );

  const executeRefresh = Effect.fn('AtomDevTools.executeRefresh')(function* (
    command: Refresh
  ): Effect.fn.Return<void, AtomNotFound> {
    const { node } = yield* getNode(command.atomId);
    const { atom } = node;
    if (hasPredefinedStates(atom) && atom[StatesTypeId].active(registry) !== void 0) {
      atom[StatesTypeId].refresh(registry);
    } else {
      registry.refresh(atom);
    }
  });

  // Returning yielded errors is required for generator narrowing.
  const executeActivateState = Effect.fn('AtomDevTools.executeActivateState')(function* (
    command: ActivateState
  ) {
    const { node } = yield* getNode(command.atomId);
    const { atom } = node;
    if (!hasPredefinedStates(atom)) {
      return yield* new StateNotFound({ atomId: command.atomId, stateId: command.stateId });
    }
    const state = atom[StatesTypeId].states().find(({ id }) => id === command.stateId);
    if (state === void 0) {
      return yield* new StateNotFound({ atomId: command.atomId, stateId: command.stateId });
    }
    atom[StatesTypeId].activate(registry, state);
    return void 0;
  });

  const executeClearState = Effect.fn('AtomDevTools.executeClearState')(function* (
    command: ClearState
  ): Effect.fn.Return<void, AtomNotFound> {
    const { node } = yield* getNode(command.atomId);
    const { atom } = node;
    if (hasPredefinedStates(atom)) {
      atom[StatesTypeId].clear(registry);
    }
  });

  const execute = Match.typeTags<Command, Effect.Effect<void, CommandError>>()({
    ActivateState: executeActivateState,
    ClearAllStates: executeClearAllStates,
    ClearState: executeClearState,
    Refresh: executeRefresh,
  });

  return AtomDevTools.of({ catalog, watch, execute });
});

const makeService = Effect.fn('AtomDevTools.makeService')(function* (): Effect.fn.Return<
  AtomDevToolsShape,
  never,
  AtomRegistry.AtomRegistry | Scope.Scope
> {
  const registry = yield* AtomRegistry.AtomRegistry;
  return yield* makeServiceRegistry(registry);
});

export class AtomDevTools extends Context.Service<AtomDevTools, AtomDevToolsShape>()(TypeId) {
  public static readonly layer: Layer.Layer<AtomDevTools, never, AtomRegistry.AtomRegistry> =
    Layer.effect(AtomDevTools, makeService());

  public static readonly layerRegistry = (
    registry: AtomRegistry.AtomRegistry
  ): Layer.Layer<AtomDevTools> => Layer.effect(AtomDevTools, makeServiceRegistry(registry));
}

export type AtomDevToolsService = AtomDevTools['Service'];
