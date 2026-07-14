import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Console, Context, Effect, Layer, LayerMap, Schedule, Stream } from 'effect';
import { FetchHttpClient, HttpClient, HttpRouter } from 'effect/unstable/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { TestServerControllerApi } from '#src/services/testing/server-controller/spec.ts';

const TestServerLogging = Context.Reference<boolean>(
  'voel/services/testing/server-controller/server/TestServerLogging',
  { defaultValue: () => false }
);

class RunningTestServer extends Context.Service<RunningTestServer>()(
  'voel/services/testing/server-controller/server/RunningTestServer',
  {
    make: Effect.fnUntraced(function* ({ port }: { port: number }) {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const verbose = yield* TestServerLogging;

      const handle = yield* Effect.acquireRelease(
        spawner.spawn(
          ChildProcess.make('bun', ['run', 'src/index.ts'], {
            cwd: `${import.meta.dir}/../../../../../server`,
            env: {
              AUTH_SECRET: 'test',
              DB_FILENAME: ':memory:',
              PORT: port.toString(),
            },
            extendEnv: true,
            stdout: verbose ? 'pipe' : 'ignore',
            stderr: verbose ? 'pipe' : 'ignore',
          })
        ),
        (h) => h.kill().pipe(Effect.catch(() => Effect.void))
      );

      if (verbose) {
        yield* handle.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) => Console.log(`[${port}] ${line}`)),
          Effect.catch(() => Effect.void),
          Effect.forkScoped
        );

        yield* handle.stderr.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) => Console.error(`[${port}] ${line}`)),
          Effect.catch(() => Effect.void),
          Effect.forkScoped
        );
      }

      const client = yield* HttpClient.HttpClient;

      yield* client.get(`http://localhost:${port}/api/auth/get-session`).pipe(
        Effect.retry({
          schedule: Schedule.max([Schedule.exponential('50 millis'), Schedule.recurs(50)]),
        })
      );

      return { handle, port };
    }),
  }
) {
  public static readonly layer = (args: Parameters<typeof this.make>[0]) =>
    Layer.effect(this, this.make(args));
}

class TestServers extends LayerMap.Service<TestServers>()(
  'voel/services/testing/server-controller/server/TestServers',
  {
    lookup: ({ port }: { port: number }) => RunningTestServer.layer({ port }),
    idleTimeToLive: 'Infinity',
  }
) {}

const TestServerControllerHandlers = Layer.mergeAll(
  TestServerControllerApi.toLayerHandler('start', ({ port }) =>
    TestServers.contextEffect({ port }).pipe(Effect.asVoid)
  ),
  TestServerControllerApi.toLayerHandler('stop', ({ port }) => TestServers.invalidate({ port }))
);

const TestServerControllerRoutes = RpcServer.layerHttp({
  group: TestServerControllerApi,
  path: '/api/rpc',
  protocol: 'http',
  concurrency: 'unbounded',
}).pipe(
  Layer.provideMerge(Layer.mergeAll(TestServerControllerHandlers)),
  Layer.provideMerge(Layer.mergeAll(TestServers.layer, RpcSerialization.layerJson)),
  Layer.provideMerge(FetchHttpClient.layer)
);

export const TestServerControllerServerLive = ({
  verbose = false,
}: {
  readonly verbose?: boolean;
}) =>
  HttpRouter.serve(TestServerControllerRoutes, {
    disableListenLog: !verbose,
    disableLogger: !verbose,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(BunHttpServer.layer({ port: 6000 }), Layer.succeed(TestServerLogging, verbose))
    )
  );

if (import.meta.main) {
  BunRuntime.runMain(Layer.launch(TestServerControllerServerLive({ verbose: true })));
}
