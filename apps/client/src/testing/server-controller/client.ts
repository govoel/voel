import { BunServices } from '@effect/platform-bun';
import {
  Context,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Ref,
  Schema,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';

import { ServerUrl } from '#src/domains/accounts/schema.ts';

const serverDirectory = new URL('../../../../server/', import.meta.url).pathname;
const decodeReady = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ type: Schema.Literal('ready'), url: ServerUrl })),
  { onExcessProperty: 'error' }
);

class TestServerStartupError extends Schema.TaggedError<
  TestServerStartupError,
  { readonly brand: unique symbol }
>('voel/testing/server-controller/client/TestServerStartupError')('TestServerStartupError', {
  message: Schema.String,
  output: Schema.String,
}) {}

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
          const ready = yield* Deferred.make<typeof ServerUrl.Type, TestServerStartupError>();
          const diagnostics = yield* Ref.make('');
          const appendOutput = (chunk: string) =>
            Ref.update(diagnostics, (previous) => (previous + chunk).slice(-16_384));
          const failStartup = (message: string) =>
            Ref.get(diagnostics).pipe(
              Effect.flatMap((output) => TestServerStartupError.make({ message, output }))
            );

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
                stderr: 'pipe',
              })
            ),
            (child) => child.kill({ forceKillAfter: '2 seconds' }).pipe(Effect.ignore)
          );

          // Keep draining both pipes after readiness so child logging cannot block the server.
          const drain = yield* Effect.all(
            [
              server.stdout.pipe(
                Stream.decodeText(),
                Stream.tap(appendOutput),
                Stream.splitLines,
                Stream.runForEach((line) =>
                  Option.match(decodeReady(line), {
                    onNone: () => Effect.void,
                    onSome: ({ url }) => Deferred.succeed(ready, url),
                  })
                )
              ),
              server.stderr.pipe(Stream.decodeText(), Stream.runForEach(appendOutput)),
            ],
            { concurrency: 'unbounded', discard: true }
          ).pipe(
            Effect.catch((error) =>
              failStartup(`Could not read test server output: ${error.message}`).pipe(
                Effect.flip,
                Effect.flatMap((startupError) => Deferred.fail(ready, startupError))
              )
            ),
            Effect.forkScoped
          );

          return yield* Effect.raceFirst(
            Deferred.await(ready),
            server.exitCode.pipe(
              Effect.match({
                onFailure: (error) => `Test server exited before readiness: ${error.message}`,
                onSuccess: (code) => `Test server exited before readiness (code ${code})`,
              }),
              Effect.flatMap((message) =>
                Fiber.join(drain).pipe(Effect.andThen(failStartup(message)))
              )
            )
          ).pipe(
            Effect.timeoutOrElse({
              duration: '10 seconds',
              orElse: () => failStartup('Test server did not become ready within 10 seconds'),
            }),
            TestClock.withLive
          );
        }),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(BunServices.layer));
}
