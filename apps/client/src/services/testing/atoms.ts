import { Context, Effect, Layer } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { AppRuntime } from '#src/services/runtime.ts';
import { makeClientTestLayers } from '#src/services/testing/utils.ts';

export class AtomTaskScheduler extends Context.Service<AtomTaskScheduler>()(
  'voel/services/testing/atoms/AtomTaskScheduler',
  {
    make: Effect.sync(() => {
      const scheduledTasks = new Set<() => void>();

      return {
        scheduleTask: (task: () => void) => {
          let active = true;
          const scheduledTask = () => {
            if (!active) {
              return;
            }

            active = false;
            scheduledTasks.delete(scheduledTask);
            task();
          };

          scheduledTasks.add(scheduledTask);
          queueMicrotask(scheduledTask);

          return () => {
            active = false;
            scheduledTasks.delete(scheduledTask);
          };
        },
        drainAtomTasks: Effect.sync(() => {
          let drainCount = 0;

          while (scheduledTasks.size > 0) {
            if (drainCount > 1000) {
              throw new Error('Atom task scheduler did not settle.');
            }

            drainCount += 1;

            const tasks: Array<() => void> = [];
            for (const scheduledTask of scheduledTasks) {
              tasks.push(scheduledTask);
            }

            for (const scheduledTask of tasks) {
              scheduledTask();
            }
          }
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}

export const ClientAtomsTestLayer = Layer.fromBuild((memoMap, scope) =>
  Effect.gen(function* () {
    const services =
      yield* Effect.context<Layer.Success<ReturnType<typeof makeClientTestLayers>>>();
    const atomTaskScheduler = yield* AtomTaskScheduler;
    const registryLayer = AtomRegistry.layerOptions({
      initialValues: [
        Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services)),
        Atom.initialValue(Atom.runtime.memoMap, memoMap),
      ],
      scheduleTask: atomTaskScheduler.scheduleTask,
    });

    return yield* Layer.effectDiscard(Atom.mount(AppRuntime)).pipe(
      Layer.provideMerge(registryLayer),
      (layer) => Layer.buildWithMemoMap(layer, memoMap, scope)
    );
  })
).pipe(Layer.provideMerge(AtomTaskScheduler.layer));

// oxlint-disable-next-line effecttsgo/lazy-effect -- Each test needs fresh database and auth layer identities.
export const makeClientAtomsTestLayer = () =>
  ClientAtomsTestLayer.pipe(Layer.provideMerge(makeClientTestLayers()));
