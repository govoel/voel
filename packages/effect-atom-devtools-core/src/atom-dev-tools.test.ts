/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Latch, Option, Schema, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import {
  AtomDevTools,
  AtomId,
  AtomNotFound,
  PredefinedStateNotFound,
} from '#src/atom-dev-tools.ts';
import type { AtomId as AtomIdType, AtomSummary } from '#src/atom-dev-tools.ts';
import { makeWithPredefinedStates } from '#src/predefined-states.ts';

const runWithService = async <A, E>(
  registry: AtomRegistry.AtomRegistry,
  effect: Effect.Effect<A, E, AtomDevTools>
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(AtomDevTools.layer),
        Effect.provideService(AtomRegistry.AtomRegistry, registry)
      )
    )
  );

const firstCatalog = (
  service: AtomDevTools['Service']
): Effect.Effect<ReadonlyArray<AtomSummary>> =>
  service.catalog.pipe(
    Stream.runHead,
    Effect.map(Option.getOrElse((): ReadonlyArray<AtomSummary> => []))
  );

const findAtomId = (catalog: ReadonlyArray<AtomSummary>, name: string): AtomIdType =>
  Option.getOrThrow(Option.fromNullishOr(catalog.find((summary) => summary.name === name))).id;

const firstAtomId = (catalog: ReadonlyArray<AtomSummary>): AtomIdType =>
  Option.getOrThrow(Option.fromNullishOr(catalog[0])).id;

const firstSnapshot = (service: AtomDevTools['Service'], id: AtomIdType) =>
  service.watch(id).pipe(Stream.runHead, Effect.map(Option.getOrThrow));

describe('AtomDevTools', () => {
  it('discovers existing and newly added nodes and restores registry callbacks', async () => {
    const registry = AtomRegistry.make();
    const existing = Atom.make(1).pipe(Atom.withLabel('Existing'));
    registry.get(existing);
    let previousAdds = 0;
    const previous = (): void => {
      previousAdds += 1;
    };
    registry.onNodeAdded = previous;

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const initial = yield* firstCatalog(service);
        expect(initial.map(({ name }) => name)).toEqual(['Existing']);

        const added = Atom.make(2).pipe(Atom.withLabel('Added'));
        registry.get(added);
        const current = yield* firstCatalog(service);
        expect(current.map(({ name }) => name)).toEqual(['Existing', 'Added']);
        expect(previousAdds).toBe(1);
      })
    );

    expect(registry.onNodeAdded).toBe(previous);
  });

  it('does not overwrite registry callbacks installed after acquisition', async () => {
    const registry = AtomRegistry.make();
    let added = 0;
    let removed = 0;
    const newerOnNodeAdded = (_node: AtomRegistry.Node<unknown>): void => {
      added += 1;
    };
    const newerOnNodeRemoved = (_node: AtomRegistry.Node<unknown>): void => {
      removed += 1;
    };

    await runWithService(
      registry,
      Effect.gen(function* () {
        yield* AtomDevTools;
        registry.onNodeAdded = newerOnNodeAdded;
        registry.onNodeRemoved = newerOnNodeRemoved;
      })
    );

    expect(registry.onNodeAdded).toBe(newerOnNodeAdded);
    expect(registry.onNodeRemoved).toBe(newerOnNodeRemoved);

    const atom = Atom.make(1);
    registry.get(atom);
    registry.reset();
    expect(added).toBe(1);
    expect(removed).toBe(1);
  });

  it('folds typed catalog additions and removals after the initial snapshot', async () => {
    const registry = AtomRegistry.make();

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const initialObserved = yield* Latch.make();
        const catalogsFiber = yield* service.catalog.pipe(
          Stream.tap(() => initialObserved.open),
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild
        );

        yield* initialObserved.await;
        const atom = Atom.make(1).pipe(Atom.withLabel('Transient'));
        registry.get(atom);
        registry.reset();

        const catalogs = yield* Fiber.join(catalogsFiber);
        expect(catalogs.map((catalog) => catalog.map(({ name }) => name))).toEqual([
          [],
          ['Transient'],
          [],
        ]);
      })
    );
  });

  it('watches metadata, graph links, and values', async () => {
    const registry = AtomRegistry.make();
    const dependency = Atom.make('dependency').pipe(Atom.withLabel('Dependency'));
    const derived = Atom.make((get) => ({ value: get(dependency), extra: 'long text' })).pipe(
      Atom.withLabel('Derived'),
      Atom.keepAlive
    );
    const asyncAtom = Atom.make(Effect.succeed(1)).pipe(Atom.withLabel('Async'), Atom.keepAlive);
    registry.get(derived);
    registry.get(asyncAtom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        const derivedId = findAtomId(catalog, 'Derived');
        const asyncId = findAtomId(catalog, 'Async');
        const dependencyId = findAtomId(catalog, 'Dependency');

        const snapshot = yield* firstSnapshot(service, derivedId);
        expect(snapshot.dependencies).toEqual([{ id: dependencyId, name: 'Dependency' }]);
        expect(snapshot.source).toBeTruthy();
        expect(snapshot.value).toBe('{\n  "value": "dependency",\n  "extra": "long text"\n}');

        const asyncSnapshot = yield* firstSnapshot(service, asyncId);
        expect(typeof asyncSnapshot.value).toBe('string');
      })
    );
  });

  it('uses serializable keys as ids', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(1).pipe(Atom.serializable({ key: 'count', schema: Schema.Finite }));
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        expect(catalog[0]).toMatchObject({
          id: 'serializable:count',
        });
      })
    );
  });

  it('executes predefined-state commands', async () => {
    const registry = AtomRegistry.make();
    const atom = makeWithPredefinedStates({ enabled: true })(
      Atom.make('normal').pipe(Atom.withLabel('Scenario'), Atom.keepAlive),
      () => [{ id: 'empty', label: 'Empty', atom: Atom.make('empty') }]
    );
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        expect(catalog).toHaveLength(1);
        expect(catalog[0]?.name).toBe('Scenario');
        const atomId = firstAtomId(catalog);

        yield* service.activatePredefinedState(atomId, 'empty');
        expect(registry.get(atom)).toBe('empty');
        expect((yield* firstCatalog(service))[0]?.hasActivePredefinedState).toBe(true);
        const active = yield* firstSnapshot(service, atomId);
        expect(active.value).toBe('empty');
        expect(active.activePredefinedStateId).toEqual(Option.some('empty'));
        expect(active.dependencies).toEqual([]);

        yield* service.refresh(atomId);
        yield* service.clearAllPredefinedStates;
        expect(registry.get(atom)).toBe('normal');
        expect((yield* firstCatalog(service))[0]?.hasActivePredefinedState).toBe(false);
        const cleared = yield* firstSnapshot(service, atomId);
        expect(cleared.value).toBe('normal');
        expect(cleared.activePredefinedStateId).toEqual(Option.none());
      })
    );
  });

  it('reports command and watch errors', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(1);
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        const atomId = firstAtomId(catalog);

        const missingAtom = yield* service
          .watch(AtomId.make('missing'))
          .pipe(Stream.runHead, Effect.flip);
        expect(missingAtom).toBeInstanceOf(AtomNotFound);

        const missingState = yield* service
          .activatePredefinedState(atomId, 'missing')
          .pipe(Effect.flip);
        expect(missingState).toBeInstanceOf(PredefinedStateNotFound);
      })
    );
  });

  it('subtracts its watch listener from subscriber counts', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(1).pipe(Atom.withLabel('Watched'));
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        const snapshot = yield* service.watch(firstAtomId(catalog)).pipe(Stream.runHead);
        expect(Option.getOrThrow(snapshot).subscriberCount).toBe(0);
      })
    );
  });

  it('emits state metadata changes when the selected state has an equal value', async () => {
    const registry = AtomRegistry.make();
    const atom = makeWithPredefinedStates({ enabled: true })(
      Atom.make('same').pipe(Atom.withLabel('Equal state'), Atom.keepAlive),
      () => [{ id: 'equal', label: 'Equal', atom: Atom.make('same') }]
    );
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        const atomId = firstAtomId(catalog);
        const initialObserved = yield* Latch.make();
        const stateObserved = yield* Latch.make();
        const snapshots: Array<Option.Option<string>> = [];
        const snapshotsFiber = yield* service.watch(atomId).pipe(
          Stream.tap(({ activePredefinedStateId }) =>
            Effect.sync(() => {
              snapshots.push(activePredefinedStateId);
              if (Option.isNone(activePredefinedStateId)) {
                initialObserved.openUnsafe();
              } else {
                stateObserved.openUnsafe();
              }
            })
          ),
          Stream.runDrain,
          Effect.forkChild
        );

        yield* initialObserved.await;
        yield* service.activatePredefinedState(atomId, 'equal');
        yield* stateObserved.await;
        expect(snapshots).toEqual([Option.none(), Option.some('equal')]);
        yield* Fiber.interrupt(snapshotsFiber);
      })
    );
  });

  it('emits one command snapshot to each watcher', async () => {
    const registry = AtomRegistry.make();
    const atom = makeWithPredefinedStates({ enabled: true })(
      Atom.make('same').pipe(Atom.withLabel('Shared watch'), Atom.keepAlive),
      () => [{ id: 'equal', label: 'Equal', atom: Atom.make('same') }]
    );
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const atomId = firstAtomId(yield* firstCatalog(service));
        const firstReady = yield* Latch.make();
        const secondReady = yield* Latch.make();
        const collect = (ready: Latch.Latch) =>
          service.watch(atomId).pipe(
            Stream.tap(() => ready.open),
            Stream.take(2),
            Stream.runCollect,
            Effect.forkChild
          );
        const firstFiber = yield* collect(firstReady);
        const secondFiber = yield* collect(secondReady);

        yield* Effect.all([firstReady.await, secondReady.await]);
        yield* service.activatePredefinedState(atomId, 'equal');

        const [first, second] = yield* Effect.all([
          Fiber.join(firstFiber),
          Fiber.join(secondFiber),
        ]);
        for (const snapshots of [first, second]) {
          expect(snapshots.map(({ activePredefinedStateId }) => activePredefinedStateId)).toEqual([
            Option.none(),
            Option.some('equal'),
          ]);
          expect(snapshots.map(({ subscriberCount }) => subscriberCount)).toEqual([0, 0]);
        }
      })
    );
  });

  it('broadcasts value changes to each watcher', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(0).pipe(Atom.withLabel('Shared value'), Atom.keepAlive);
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const atomId = firstAtomId(yield* firstCatalog(service));
        const firstReady = yield* Latch.make();
        const secondReady = yield* Latch.make();
        const collect = (ready: Latch.Latch) =>
          service.watch(atomId).pipe(
            Stream.tap(() => ready.open),
            Stream.take(2),
            Stream.runCollect,
            Effect.forkChild
          );
        const firstFiber = yield* collect(firstReady);
        const secondFiber = yield* collect(secondReady);

        yield* Effect.all([firstReady.await, secondReady.await]);
        registry.set(atom, 1);

        const [first, second] = yield* Effect.all([
          Fiber.join(firstFiber),
          Fiber.join(secondFiber),
        ]);
        expect(first.map(({ value }) => value)).toEqual(['0', '1']);
        expect(second.map(({ value }) => value)).toEqual(['0', '1']);
      })
    );
  });

  it('emits one initial snapshot for an uninitialized node', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(() => 1).pipe(Atom.withLabel('Uninitialized'));
    const cancelExternal = registry.subscribe(atom, () => void 0);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        const observed: Array<unknown> = [];
        const initialObserved = yield* Latch.make();
        const watchFiber = yield* service.watch(firstAtomId(catalog)).pipe(
          Stream.tap(({ value }) =>
            Effect.sync(() => {
              observed.push(value);
              initialObserved.openUnsafe();
            })
          ),
          Stream.runDrain,
          Effect.forkChild
        );

        yield* initialObserved.await;
        expect(observed).toEqual(['1']);
        yield* Fiber.interrupt(watchFiber);
      })
    );

    cancelExternal();
  });

  it('fails a watch when its node is removed and allows watching a replacement', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(1).pipe(Atom.withLabel('Resettable'), Atom.keepAlive);
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const catalog = yield* firstCatalog(service);
        const atomId = firstAtomId(catalog);
        const initialObserved = yield* Latch.make();
        const failureFiber = yield* service.watch(atomId).pipe(
          Stream.tap(() => initialObserved.open),
          Stream.runDrain,
          Effect.flip,
          Effect.forkChild
        );

        yield* initialObserved.await;
        registry.reset();

        const failure = yield* Fiber.join(failureFiber);
        expect(failure).toBeInstanceOf(AtomNotFound);

        registry.get(atom);
        const replacement = yield* firstSnapshot(service, atomId);
        expect(replacement.value).toBe('1');
      })
    );
  });

  it('fails displaced watchers when a replacement is added before the old node is removed', async () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(1).pipe(Atom.withLabel('Replaceable'), Atom.keepAlive);
    registry.get(atom);

    await runWithService(
      registry,
      Effect.gen(function* () {
        const service = yield* AtomDevTools;
        const atomId = firstAtomId(yield* firstCatalog(service));
        const oldNode = Option.getOrThrow(Option.fromNullishOr(registry.getNodes().get(atom)));
        const initialObserved = yield* Latch.make();
        const failureFiber = yield* service.watch(atomId).pipe(
          Stream.tap(() => initialObserved.open),
          Stream.runDrain,
          Effect.flip,
          Effect.forkChild
        );

        yield* initialObserved.await;

        const delayedRemove = Option.getOrThrow(Option.fromNullishOr(registry.onNodeRemoved));
        registry.onNodeRemoved = void 0;
        registry.reset();
        registry.onNodeRemoved = delayedRemove;

        registry.get(atom);
        delayedRemove(oldNode);

        const failure = yield* Fiber.join(failureFiber);
        expect(failure).toBeInstanceOf(AtomNotFound);

        const replacement = yield* firstSnapshot(service, atomId);
        expect(replacement.value).toBe('1');
      })
    );
  });
});
