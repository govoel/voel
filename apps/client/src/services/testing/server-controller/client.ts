import { BunServices } from '@effect/platform-bun';
import { Context, Effect, Layer, Schedule } from 'effect';
import { TestClock } from 'effect/testing';
import { FetchHttpClient, HttpClient } from 'effect/unstable/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const serverDirectory = new URL('../../../../../server/', import.meta.url).pathname;

export class TestServerControllerClient extends Context.Service<TestServerControllerClient>()(
  'voel/services/testing/server-controller/client/TestServerControllerClient',
  {
    make: Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const httpClient = yield* HttpClient.HttpClient;

      return {
        start: Effect.fnUntraced(function* ({ port }: { readonly port: number }) {
          yield* Effect.acquireRelease(
            spawner.spawn(
              ChildProcess.make('bun', ['run', 'src/index.ts'], {
                cwd: serverDirectory,
                env: {
                  AUTH_SECRET: 'test',
                  DB_FILENAME: ':memory:',
                  PORT: port.toString(),
                },
                extendEnv: true,
                stdout: 'ignore',
                stderr: 'ignore',
              })
            ),
            (server) => server.kill().pipe(Effect.ignore)
          );

          const serverUrl = `http://localhost:${port}`;
          yield* httpClient.get(`${serverUrl}/api/auth/get-session`).pipe(
            Effect.retry({
              schedule: Schedule.max([Schedule.exponential('50 millis'), Schedule.recurs(50)]),
            }),
            TestClock.withLive
          );

          return serverUrl;
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);

  public static readonly layerNoDeps = this.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer))
  );
}
