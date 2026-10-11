import { Context, Effect, Layer, Scheduler } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { AppRuntime } from '#src/services/runtime.ts';
import { makeClientTestLayers } from '#src/services/testing/utils.ts';

// Route atom callbacks and service fibers through one drainable dispatcher.
// Draining runs queued work; it does not wait for SQL, network requests, or timers.
export class TestScheduler extends Context.Service<TestScheduler>()(
  'voel/services/testing/atoms/TestScheduler',
  {
    make: Effect.sync(() => {
      const scheduler = new Scheduler.MixedScheduler();
      const dispatcher = scheduler.makeDispatcher();

      return {
        scheduler: {
          executionMode: scheduler.executionMode,
          shouldYield: (fiber) => scheduler.shouldYield(fiber),
          makeDispatcher: () => dispatcher,
        } satisfies Scheduler.Scheduler,
        scheduleTask: (task: () => void) => {
          let active = true;
          dispatcher.scheduleTask(() => {
            if (!active) {
              return;
            }

            active = false;
            task();
          }, 0);

          return () => {
            active = false;
          };
        },
        drainScheduler: Effect.sync(() => {
          dispatcher.flush();
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.unwrap(
    this.pipe(Effect.map(({ scheduler }) => Layer.succeed(Scheduler.Scheduler, scheduler)))
  ).pipe(Layer.provideMerge(Layer.effect(this, this.make)));
}

export const ClientAtomsTestLayer = Layer.fromBuild((memoMap, scope) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<
      | Layer.Success<ReturnType<typeof makeClientTestLayers>>
      | Layer.Success<typeof TestScheduler.layer>
    >();
    const { scheduleTask } = yield* TestScheduler;
    const registryLayer = AtomRegistry.layerOptions({
      initialValues: [
        Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services)),
        Atom.initialValue(Atom.runtime.memoMap, memoMap),
      ],
      scheduleTask,
    });

    return yield* Layer.effectDiscard(Atom.mount(AppRuntime)).pipe(
      Layer.provideMerge(registryLayer),
      (layer) => Layer.buildWithMemoMap(layer, memoMap, scope)
    );
  })
);

// oxlint-disable-next-line effecttsgo/lazy-effect -- Each test needs fresh database and auth layer identities.
export const makeClientAtomsTestLayer = () =>
  ClientAtomsTestLayer.pipe(
    Layer.provideMerge(makeClientTestLayers()),
    Layer.provideMerge(TestScheduler.layer)
  );
