import type { HarnessTestContext, TestFn } from '@react-native-harness/bridge';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect as harnessExpect,
  it as harnessIt,
  test as harnessTest,
} from '@react-native-harness/runtime';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as Scope from 'effect/Scope';
import * as TestClock from 'effect/testing/TestClock';
import * as TestConsole from 'effect/testing/TestConsole';

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  cleanup,
  clearAllMocks,
  createElement,
  describe,
  expect,
  fn,
  harness,
  mock,
  ReactNativeHarness,
  render,
  requireActual,
  resetAllMocks,
  resetModules,
  restoreAllMocks,
  spyOn,
  unmock,
  waitFor,
  waitUntil,
} from '@react-native-harness/runtime';
export type { HarnessNamespace, RenderOptions, RenderResult } from '@react-native-harness/runtime';
export type { HarnessTaskContext, HarnessTestContext } from '@react-native-harness/bridge';

export type HarnessTestApi = typeof harnessIt;
export type API = HarnessTestApi;
export type HarnessTestFunction = TestFn;

export type EffectTestFunction<A, E, R, Args extends readonly unknown[]> = (
  ...args: Args
) => Effect.Effect<A, E, R>;

export type EffectTest<R> = <A, E>(
  name: string,
  self: EffectTestFunction<A, E, R, [context: HarnessTestContext]>
) => void;

export type EffectTester<R> = EffectTest<R> & {
  readonly skip: EffectTest<R>;
  readonly skipIf: (condition: unknown) => EffectTest<R>;
  readonly runIf: (condition: unknown) => EffectTest<R>;
  readonly only: EffectTest<R>;
  readonly each: <T>(
    cases: readonly T[]
  ) => <A, E>(
    name: string,
    self: EffectTestFunction<A, E, R, [testCase: T, context: HarnessTestContext]>
  ) => void;
  readonly fails: EffectTest<R>;
};

export type Each = <T>(
  cases: readonly T[]
) => (name: string, fn: (testCase: T, context: HarnessTestContext) => void | Promise<void>) => void;

export interface LayerOptions {
  readonly excludeTestServices?: boolean;
  readonly memoMap?: Layer.MemoMap;
}

export type LayerBlock<R> = ((fn: (it: MethodsNonLive<R>) => void) => void) &
  ((name: string, fn: (it: MethodsNonLive<R>) => void) => void);

interface BaseMethods<R, TLayerOptions> extends HarnessTestApi {
  readonly effect: EffectTester<R | Scope.Scope>;
  readonly layer: <R2, E>(
    layer: Layer.Layer<R2, E, R>,
    options?: TLayerOptions
  ) => LayerBlock<R | R2>;
  readonly each: Each;
}

export type MethodsNonLive<R = never> = BaseMethods<R, never>;

export type Methods<R = never> = BaseMethods<R, LayerOptions> & {
  readonly live: EffectTester<R | Scope.Scope>;
};

type TestEnvironment = TestConsole.TestConsole | TestClock.TestClock;

type EffectMap<R> = <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>;

interface MethodMaps<R> {
  readonly effect: EffectMap<R | Scope.Scope>;
  readonly live: EffectMap<R | Scope.Scope>;
}

const TestEnv: Layer.Layer<TestEnvironment> = Layer.mergeAll(TestConsole.layer, TestClock.layer());

export const addEqualityTesters = (): void => {
  harnessExpect.extend({});
};

const runPromise = async <A, E>(
  effect: Effect.Effect<A, E>,
  context?: HarnessTestContext
): Promise<A> => {
  const program: Effect.Effect<() => A> = Effect.gen(function* () {
    const fiber = yield* effect.pipe(Effect.forkChild);

    context?.onTestFinished(async () => {
      await Fiber.interrupt(fiber).pipe(Effect.asVoid, Effect.runPromise);
    });

    const exit = yield* Fiber.await(fiber);

    if (Exit.isSuccess(exit)) {
      return () => exit.value;
    }

    const errors = Cause.prettyErrors(exit.cause);
    for (const error of errors) {
      yield* Effect.logError(error);
    }

    const error = errors[0] ?? new Error('Effect failed without a reported cause');
    return () => {
      throw error;
    };
  });

  const resume = await Effect.runPromise(program);
  return resume();
};

const runTest =
  (context?: HarnessTestContext) =>
  async <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    runPromise(effect, context);

const runEffectTest = async <A, E, R, Args extends readonly unknown[]>(
  context: HarnessTestContext,
  args: Args,
  options: {
    readonly self: EffectTestFunction<A, E, R, Args>;
    readonly mapEffect: EffectMap<R>;
  }
): Promise<A> =>
  Effect.suspend(() => options.self(...args)).pipe(options.mapEffect, runTest(context));

const expectFailure = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<void, never, R> =>
  Effect.exit(effect).pipe(
    Effect.flatMap((exit) => {
      if (Exit.isFailure(exit)) {
        return Effect.void;
      }

      return Effect.die(new Error('Expected effect to fail'));
    })
  );

const mapTestEnv = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>): Effect.Effect<A, E> =>
  effect.pipe(Effect.scoped, Effect.provide(TestEnv));

const mapLive = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>): Effect.Effect<A, E> =>
  effect.pipe(Effect.scoped);

const formatValue = (value: unknown, json = false): string => {
  if (json) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const caseValues = (testCase: unknown): readonly unknown[] =>
  Array.isArray(testCase) ? testCase : [testCase];

const caseNamePlaceholderPattern = /%[#sdifj]/gu;

const formatCaseName = (name: string, testCase: unknown, index: number): string => {
  if (!caseNamePlaceholderPattern.test(name)) {
    return `${name} [${index}]`;
  }

  caseNamePlaceholderPattern.lastIndex = 0;

  const values = caseValues(testCase);
  let valueIndex = 0;

  return name.replaceAll(caseNamePlaceholderPattern, (token) => {
    if (token === '%#') {
      return String(index);
    }

    const value = values[valueIndex];
    valueIndex += 1;
    return formatValue(value, token === '%j');
  });
};

const makeEach =
  (api: HarnessTestApi): Each =>
  (cases) =>
  (name, fn) => {
    let index = 0;
    for (const testCase of cases) {
      const caseIndex = index;
      index += 1;
      api(formatCaseName(name, testCase, caseIndex), async (context) => {
        await fn(testCase, context);
      });
    }
  };

const makeEffectEach =
  <R>(api: HarnessTestApi, mapEffect: EffectMap<R>): EffectTester<R>['each'] =>
  (cases) =>
  (name, self) => {
    let index = 0;
    for (const testCase of cases) {
      const caseIndex = index;
      index += 1;
      api(formatCaseName(name, testCase, caseIndex), async (context) => {
        await runEffectTest(context, [testCase, context], { self, mapEffect });
      });
    }
  };

const makeTester = <R>(
  mapEffect: EffectMap<R>,
  api: HarnessTestApi = harnessIt
): EffectTester<R> => {
  const effect: EffectTest<R> = (name, self) => {
    api(name, async (context) => {
      await runEffectTest(context, [context], { self, mapEffect });
    });
  };

  const skip: EffectTest<R> = (name, self) => {
    api.skip(name, async (context) => {
      await runEffectTest(context, [context], { self, mapEffect });
    });
  };

  const only: EffectTest<R> = (name, self) => {
    api.only(name, async (context) => {
      await runEffectTest(context, [context], { self, mapEffect });
    });
  };

  const fails: EffectTest<R> = (name, self) => {
    api(name, async (context) => {
      await runEffectTest(context, [context], {
        self: (testContext) => expectFailure(self(testContext)),
        mapEffect,
      });
    });
  };

  return Object.assign(effect, {
    skip,
    skipIf: (condition: unknown) => {
      const shouldSkip = Boolean(condition);
      return shouldSkip ? skip : effect;
    },
    runIf: (condition: unknown) => {
      const shouldRun = Boolean(condition);
      return shouldRun ? effect : skip;
    },
    only,
    each: makeEffectEach(api, mapEffect),
    fails,
  });
};

const makeItProxy = <TMethods extends object>(
  api: HarnessTestApi,
  overrides: TMethods
): TMethods & HarnessTestApi => {
  const callable: HarnessTestApi = Object.assign(
    (name: string, fn: HarnessTestFunction) => {
      api(name, fn);
    },
    {
      skip: (name: string, fn: HarnessTestFunction) => {
        api.skip(name, fn);
      },
      only: (name: string, fn: HarnessTestFunction) => {
        api.only(name, fn);
      },
      todo: (name: string) => {
        api.todo(name);
      },
    }
  );

  return Object.assign(callable, overrides);
};

const makeRecordingApi = (api: HarnessTestApi, record: (name: string) => void): HarnessTestApi =>
  Object.assign(
    (name: string, fn: HarnessTestFunction) => {
      record(name);
      api(name, fn);
    },
    {
      skip: (name: string, fn: HarnessTestFunction) => {
        api.skip(name, fn);
      },
      only: (name: string, fn: HarnessTestFunction) => {
        record(name);
        api.only(name, fn);
      },
      todo: (name: string) => {
        api.todo(name);
      },
    }
  );

const makeNonLiveMethods = <R>(
  api: HarnessTestApi,
  mapEffect: EffectMap<R | Scope.Scope>,
  layer: MethodsNonLive<R>['layer']
): MethodsNonLive<R> =>
  makeItProxy(api, {
    effect: makeTester(mapEffect, api),
    layer,
    each: makeEach(api),
  });

const makeMethodsWithLayer = <R>(
  api: HarnessTestApi,
  maps: MethodMaps<R>,
  layer: Methods<R>['layer']
): Methods<R> =>
  makeItProxy(api, {
    effect: makeTester(maps.effect, api),
    live: makeTester(maps.live, api),
    layer,
    each: makeEach(api),
  });

const makeLayerBlock =
  <R, E>(
    layer_: Layer.Layer<R, E>,
    options: LayerOptions = {},
    parentRecordTask?: (name: string) => void
  ): LayerBlock<R> =>
  (
    ...args:
      | [fn: (it: MethodsNonLive<R>) => void]
      | [name: string, fn: (it: MethodsNonLive<R>) => void]
  ) => {
    const excludeTestServices = options.excludeTestServices ?? false;
    const layerWithTestEnv = excludeTestServices ? layer_ : Layer.provideMerge(layer_, TestEnv);
    const memoMap = options.memoMap ?? Effect.runSync(Layer.makeMemoMap);
    const scope = Effect.runSync(Scope.make());
    const contextEffect = Layer.buildWithMemoMap(layerWithTestEnv, memoMap, scope).pipe(
      Effect.orDie,
      Effect.cached,
      Effect.runSync
    );
    let closed = false;

    const closeScope = async (context?: HarnessTestContext): Promise<void> => {
      if (closed) {
        return;
      }

      closed = true;
      await runPromise(Scope.close(scope, Exit.void), context);
    };

    const withLayer = <A, E2, R2>(effect: Effect.Effect<A, E2, R2>) =>
      contextEffect.pipe(Effect.flatMap((context) => effect.pipe(Effect.provide(context))));

    const mapLayer = <A, E2>(effect: Effect.Effect<A, E2, R | Scope.Scope>) =>
      effect.pipe(Effect.scoped, withLayer);

    const makeNestedLayer =
      (recordTask?: (name: string) => void): MethodsNonLive<R>['layer'] =>
      (nestedLayer_) =>
        makeLayerBlock(
          Layer.provideMerge(nestedLayer_, layerWithTestEnv),
          {
            excludeTestServices,
            memoMap: Layer.forkMemoMapUnsafe(memoMap),
          },
          recordTask
        );

    const makeIt = (api: HarnessTestApi, recordTask?: (name: string) => void): MethodsNonLive<R> =>
      makeNonLiveMethods(api, mapLayer, makeNestedLayer(recordTask));

    if (args.length === 1) {
      const blockTaskCounts = new Map<string, number>();
      const recordTask = (name: string) => {
        blockTaskCounts.set(name, (blockTaskCounts.get(name) ?? 0) + 1);
        parentRecordTask?.(name);
      };

      const [fn] = args;
      fn(makeIt(makeRecordingApi(harnessIt, recordTask), recordTask));

      let remaining = 0;
      for (const count of blockTaskCounts.values()) {
        remaining += count;
      }

      if (remaining === 0) {
        afterAll(async () => {
          await closeScope();
        });
        return;
      }

      beforeEach(async (context): Promise<void> => {
        const count = blockTaskCounts.get(context.task.name);
        if (count === void 0 || count <= 0) {
          return;
        }

        blockTaskCounts.set(context.task.name, count - 1);
        context.onTestFinished(async () => {
          remaining -= 1;
          if (remaining === 0) {
            await closeScope(context);
          }
        });

        await contextEffect.pipe(Effect.asVoid, runTest(context));
      });
      afterAll(async () => {
        await closeScope();
      });
      return;
    }

    const [name, fn] = args;
    describe(name, () => {
      beforeAll(async () => {
        await contextEffect.pipe(Effect.asVoid, runPromise);
      });
      afterAll(async () => {
        await closeScope();
      });
      const api =
        parentRecordTask === void 0 ? harnessIt : makeRecordingApi(harnessIt, parentRecordTask);
      fn(makeIt(api, parentRecordTask));
    });
  };

export const makeMethods = (api: HarnessTestApi): Methods =>
  makeMethodsWithLayer<never>(api, { effect: mapTestEnv, live: mapLive }, (layer_, options) =>
    makeLayerBlock(layer_, options)
  );

export const it: Methods = makeMethods(harnessIt);
export const test: Methods = makeMethods(harnessTest);
export const { effect, live, layer } = it;

export const describeWrapped = (name: string, fn: (it: Methods) => void): void => {
  describe(name, () => {
    fn(makeMethods(harnessIt));
  });
};
