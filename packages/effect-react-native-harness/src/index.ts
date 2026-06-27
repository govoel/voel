import {
  afterAll,
  beforeAll,
  describe,
  it as harnessIt,
  test as harnessTest,
} from '@react-native-harness/runtime';
import { Cause, Effect, Exit, Fiber, Layer, Scope } from 'effect';
import { TestClock, TestConsole } from 'effect/testing';

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
} from '@react-native-harness/runtime';

export type HarnessTestApi = typeof harnessIt;
export type HarnessTestFunction = Parameters<HarnessTestApi>[1];
export type HarnessTestContext = Parameters<HarnessTestFunction>[0];
export type HarnessTaskContext = HarnessTestContext['task'];

export type EffectTestFunction<A, E, R, Args extends readonly unknown[]> = (
  ...args: Args
) => Effect.Effect<A, E, R>;

export type EffectTest<R> = <A, E>(
  name: string,
  self: EffectTestFunction<A, E, R, [context: HarnessTestContext]>
) => void;

export type Each = <T>(
  cases: readonly T[]
) => (name: string, fn: (testCase: T, context: HarnessTestContext) => void | Promise<void>) => void;

export type LayerBlock<R> = ((fn: (it: Methods<R>) => void) => void) &
  ((name: string, fn: (it: Methods<R>) => void) => void);

export interface Methods<R = never> extends HarnessTestApi {
  readonly effect: EffectTest<R>;
  readonly live: EffectTest<R>;
  readonly scoped: EffectTest<R | Scope.Scope>;
  readonly scopedLive: EffectTest<R | Scope.Scope>;
  readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>) => LayerBlock<R | R2>;
  readonly each: Each;
}

type TestEnvironment = TestConsole.TestConsole | TestClock.TestClock;

const TestEnv: Layer.Layer<TestEnvironment> = Layer.mergeAll(TestConsole.layer, TestClock.layer());

const runPromise = async <A, E>(
  effect: Effect.Effect<A, E>,
  context?: HarnessTestContext
): Promise<A> => {
  const program: Effect.Effect<() => A> = Effect.gen(function* () {
    const fiber = yield* effect.pipe(Effect.exit, Effect.forkChild);

    context?.onTestFinished(async () => {
      await Fiber.interrupt(fiber).pipe(Effect.asVoid, Effect.runPromise);
    });

    const exit = yield* Fiber.join(fiber);

    if (Exit.isSuccess(exit)) {
      return () => exit.value;
    }

    const errors = Cause.prettyErrors(exit.cause);
    for (let i = 1; i < errors.length; i += 1) {
      const error = errors[i];
      if (error !== void 0) {
        yield* Effect.logError(error);
      }
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

const provideTestEnv = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, TestEnv);

const testOptions =
  <R>(
    api: HarnessTestApi,
    mapEffect: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
  ): EffectTest<R> =>
  (name, self) => {
    api(name, async (context) => {
      await Effect.suspend(() => self(context)).pipe(mapEffect, runTest(context));
    });
  };

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

const makeCallable = <R>(
  api: HarnessTestApi,
  overrides: Omit<Methods<R>, keyof HarnessTestApi>
): Methods<R> => {
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

interface MethodMaps<R> {
  readonly effect: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>;
  readonly live: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>;
  readonly scoped: <A, E>(effect: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, E>;
  readonly scopedLive: <A, E>(effect: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, E>;
}

const makeMethods = <R>(
  api: HarnessTestApi,
  maps: MethodMaps<R>,
  layer: Methods<R>['layer']
): Methods<R> =>
  makeCallable(api, {
    effect: testOptions(api, maps.effect),
    live: testOptions(api, maps.live),
    scoped: testOptions(api, maps.scoped),
    scopedLive: testOptions(api, maps.scopedLive),
    layer,
    each: makeEach(api),
  });

const baseMaps: MethodMaps<never> = {
  effect: provideTestEnv,
  live: (effect) => effect,
  scoped: (effect) => effect.pipe(Effect.scoped, provideTestEnv),
  scopedLive: (effect) => effect.pipe(Effect.scoped),
};

const makeLayerBlock =
  <R>(layer_: Layer.Layer<R>) =>
  (...args: [fn: (it: Methods<R>) => void] | [name: string, fn: (it: Methods<R>) => void]) => {
    const memoMap = Effect.runSync(Layer.makeMemoMap);
    const scope = Effect.runSync(Scope.make());
    const contextEffect = Layer.buildWithMemoMap(layer_, memoMap, scope).pipe(
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

    const layeredMaps: MethodMaps<R> = {
      effect: (effect) => withLayer(effect).pipe(provideTestEnv),
      live: withLayer,
      scoped: (effect) => effect.pipe(Effect.scoped, withLayer, provideTestEnv),
      scopedLive: (effect) => effect.pipe(Effect.scoped, withLayer),
    };

    const layeredIt = makeMethods(harnessIt, layeredMaps, makeNestedLayer(layer_));

    const register = (fn: (it: Methods<R>) => void) => {
      beforeAll(async () => {
        await contextEffect.pipe(Effect.asVoid, runPromise);
      });
      afterAll(async () => {
        await closeScope();
      });
      fn(layeredIt);
    };

    if (args.length === 1) {
      register(args[0]);
      return;
    }

    describe(args[0], () => {
      register(args[1]);
    });
  };

const makeBaseLayer: Methods['layer'] = (layer_) => makeLayerBlock(Layer.orDie(layer_));

const makeNestedLayer =
  <RCurrent>(parentLayer: Layer.Layer<RCurrent>): Methods<RCurrent>['layer'] =>
  (layer_) =>
    makeLayerBlock(Layer.provideMerge(Layer.orDie(layer_), parentLayer));

export const it: Methods = makeMethods(harnessIt, baseMaps, makeBaseLayer);
export const test: Methods = makeMethods(harnessTest, baseMaps, makeBaseLayer);
