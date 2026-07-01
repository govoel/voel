import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Context, Effect, Layer, LayerMap } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { TestServerControllerApi } from '#src/services/testing/server-controller/spec.ts';

class RunningTestServer extends Context.Service<RunningTestServer>()(
  'voel/services/testing/server-controller/server/RunningTestServer',
  {
    make: Effect.fnUntraced(function* ({ port }: { port: number }) {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const handle = yield* Effect.acquireRelease(
        spawner.spawn(
          ChildProcess.make('bun', ['run', 'src/index.ts'], {
            cwd: '../../apps/server',
            env: { PORT: port.toString() },
          })
        ),
        (h) => h.kill().pipe(Effect.catch(() => Effect.void))
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
  Layer.provideMerge(Layer.mergeAll(TestServers.layer, RpcSerialization.layerJson))
);

if (import.meta.main) {
  const HttpServerLive = BunHttpServer.layer({ port: 3000 });

  const ServerLive = HttpRouter.serve(TestServerControllerRoutes).pipe(
    Layer.provide(HttpServerLive)
  );

  BunRuntime.runMain(Layer.launch(ServerLive));
}
