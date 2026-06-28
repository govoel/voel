import type { HarnessTestContext, TestFn } from '@react-native-harness/bridge';
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
export type { HarnessTaskContext, HarnessTestContext } from '@react-native-harness/bridge';

export type HarnessTestApi = typeof harnessIt;
export type HarnessTestFunction = TestFn;

type HarnessRegister = (name: string, fn: HarnessTestFunction) => void;

export type EffectTestFunction<A, E, R, Args extends unknown[]> = (
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
  readonly scoped: EffectTester<R | Scope.Scope>;
  readonly layer: <R2, E>(
    layer: Layer.Layer<R2, E, R>,
    options?: TLayerOptions
  ) => LayerBlock<R | R2>;
  readonly each: Each;
}

export type MethodsNonLive<R = never> = BaseMethods<R, never>;

export type Methods<R = never> = BaseMethods<R, LayerOptions> & {
  readonly live: EffectTester<R | Scope.Scope>;
  readonly scopedLive: EffectTester<R | Scope.Scope>;
};

type TestEnvironment = TestConsole.TestConsole | TestClock.TestClock;

type EffectMap<R> = <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>;

interface MethodMaps<R> {
  readonly effect: EffectMap<R | Scope.Scope>;
  readonly live: EffectMap<R | Scope.Scope>;
}

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

const runEffectTest = async <A, E, R, Args extends unknown[]>(
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

const testOptions =
  <R>(api: HarnessRegister, mapEffect: EffectMap<R>): EffectTest<R> =>
  (name, self) => {
    api(name, async (context) => {
      await runEffectTest(context, [context], { self, mapEffect });
    });
  };

const failingTestOptions =
  <R>(api: HarnessRegister, mapEffect: EffectMap<R>): EffectTest<R> =>
  (name, self) => {
    api(name, async (context) => {
      await runEffectTest(context, [context], {
        self: (testContext) => expectFailure(self(testContext)),
        mapEffect,
      });
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
  (api: HarnessRegister): Each =>
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
  <R>(api: HarnessRegister, mapEffect: EffectMap<R>): EffectTester<R>['each'] =>
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

const makeTester = <R>(api: HarnessTestApi, mapEffect: EffectMap<R>): EffectTester<R> => {
  const effect = testOptions<R>((name, fn) => {
    api(name, fn);
  }, mapEffect);
  const skip = testOptions<R>((name, fn) => {
    api.skip(name, fn);
  }, mapEffect);
  const only = testOptions<R>((name, fn) => {
    api.only(name, fn);
  }, mapEffect);

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
    fails: failingTestOptions<R>((name, fn) => {
      api(name, fn);
    }, mapEffect),
  });
};

const makeCallable = <TMethods extends object>(
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

const makeNonLiveMethods = <R>(
  api: HarnessTestApi,
  mapEffect: EffectMap<R | Scope.Scope>,
  layer: MethodsNonLive<R>['layer']
): MethodsNonLive<R> => {
  const effect = makeTester(api, mapEffect);

  return makeCallable(api, {
    effect,
    scoped: effect,
    layer,
    each: makeEach(api),
  });
};

const makeMethodsWithLayer = <R>(
  api: HarnessTestApi,
  maps: MethodMaps<R>,
  layer: Methods<R>['layer']
): Methods<R> => {
  const effect = makeTester(api, maps.effect);
  const live = makeTester(api, maps.live);

  return makeCallable(api, {
    effect,
    live,
    scoped: effect,
    scopedLive: live,
    layer,
    each: makeEach(api),
  });
};

const makeLayerBlock =
  <R, E>(layer_: Layer.Layer<R, E>, options: LayerOptions = {}): LayerBlock<R> =>
  (
    ...args:
      | [fn: (it: MethodsNonLive<R>) => void]
      | [name: string, fn: (it: MethodsNonLive<R>) => void]
  ) => {
    const { excludeTestServices = false, memoMap: providedMemoMap } = options;
    const layerWithTestEnv = excludeTestServices ? layer_ : Layer.provideMerge(layer_, TestEnv);
    const memoMap = providedMemoMap ?? Effect.runSync(Layer.makeMemoMap);
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

    const nestedLayer: MethodsNonLive<R>['layer'] = (nestedLayer_) =>
      makeLayerBlock(Layer.provideMerge(nestedLayer_, layerWithTestEnv), {
        excludeTestServices,
        memoMap: Layer.forkMemoMapUnsafe(memoMap),
      });

    const mapLayer = <A, E2>(effect: Effect.Effect<A, E2, R | Scope.Scope>) =>
      effect.pipe(Effect.scoped, withLayer);
    const layeredIt = makeNonLiveMethods(harnessIt, mapLayer, nestedLayer);

    const register = (fn: (it: MethodsNonLive<R>) => void) => {
      beforeAll(async () => {
        await contextEffect.pipe(Effect.asVoid, runPromise);
      });
      afterAll(async () => {
        await closeScope();
      });
      fn(layeredIt);
    };

    if (args.length === 1) {
      const [fn] = args;
      register(fn);
      return;
    }

    const [name, fn] = args;
    describe(name, () => {
      register(fn);
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
