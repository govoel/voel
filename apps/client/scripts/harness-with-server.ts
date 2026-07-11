import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Runtime, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { TestServerControllerServerLive } from '#src/services/testing/server-controller/server.ts';

class HarnessFailure extends Schema.TaggedErrorClass<
  HarnessFailure,
  { readonly brand: unique symbol }
>()('voel/scripts/harness-with-server/HarnessFailure', { exitCode: Schema.Number }) {
  public override get [Runtime.errorExitCode](): number {
    return this.exitCode;
  }
}

const runHarness = Effect.fn('runHarness')(function* (runner: 'ios' | 'android') {
  const handle = yield* ChildProcess.make('bun', ['harness', '--harnessRunner', runner], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = yield* handle.exitCode;

  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new HarnessFailure({ exitCode });
  }

  return yield* Effect.void;
});

const withTestServer = Effect.fn('withTestServer')(function* ({
  runners,
  verbose,
}: {
  readonly runners: readonly ('ios' | 'android')[];
  readonly verbose: boolean;
}) {
  yield* TestServerControllerServerLive({ verbose }).pipe(Layer.launch, Effect.forkScoped);

  for (const runner of runners) {
    yield* runHarness(runner);
  }
});

const command = Command.make(
  'harness-with-server',
  {
    runners: Flag.choice('harnessRunner', ['ios', 'android']).pipe(Flag.atLeast(1)),
    verbose: Flag.boolean('verbose').pipe(
      Flag.withDescription('Print test server stdout and stderr')
    ),
  },
  (args) => withTestServer(args).pipe(Effect.scoped)
);

command.pipe(
  Command.run({ version: '0.0.0' }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain({ disableErrorReporting: true })
);
