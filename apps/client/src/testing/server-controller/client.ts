import { BunServices } from '@effect/platform-bun';
import { Context, Deferred, Effect, FileSystem, Layer, Option, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';

import { ServerUrl } from '#src/domains/accounts/schema.ts';

const serverDirectory = new URL('../../../../server/', import.meta.url).pathname;
const decodeReady = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ type: Schema.Literal('ready'), url: ServerUrl })),
  { onExcessProperty: 'error' }
);

export class TestServerControllerClient extends Context.Service<TestServerControllerClient>()(
  'voel/testing/server-controller/client/TestServerControllerClient',
  {
    make: Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;

      return {
        start: Effect.gen(function* () {
          const databaseDirectory = yield* fs.makeTempDirectoryScoped({
            prefix: 'voel-client-test-server-',
          });
          const ready = yield* Deferred.make<typeof ServerUrl.Type>();

          const server = yield* Effect.acquireRelease(
            spawner.spawn(
              ChildProcess.make('bun', ['run', 'src/testing/server.ts'], {
                cwd: serverDirectory,
                env: {
                  AUTH_SECRET: 'test',
                  AUTH_DB_FILENAME: `${databaseDirectory}/auth.db`,
                  LIBRARY_DB_FILENAME: `${databaseDirectory}/library.db`,
                },
                extendEnv: true,
                stdout: 'pipe',
                stderr: 'ignore',
              })
            ),
            (child) => child.kill({ forceKillAfter: '2 seconds' }).pipe(Effect.ignore)
          );

          // Continue draining stdout after readiness so server logging cannot block the child.
          yield* server.stdout.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.runForEach((line) =>
              Option.match(decodeReady(line), {
                onNone: () => Effect.void,
                onSome: ({ url }) => Deferred.succeed(ready, url),
              })
            ),
            Effect.catch((error) => Deferred.die(ready, error)),
            Effect.forkScoped
          );

          return yield* Effect.raceFirst(
            Deferred.await(ready),
            server.exitCode.pipe(
              Effect.flatMap((code) =>
                Effect.die(new Error(`Test server exited before readiness (code ${code})`))
              )
            )
          ).pipe(Effect.timeout('10 seconds'), TestClock.withLive);
        }),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(BunServices.layer));
}
