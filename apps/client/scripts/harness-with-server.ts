import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Runtime, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { TestServerControllerServerLive } from '#src/services/testing/server-controller/server.ts';

class HarnessFailure extends Schema.TaggedErrorClass<HarnessFailure>()(
  'voel/scripts/harness-with-server/HarnessFailure',
  { exitCode: Schema.Number }
) {
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

const withTestServer = Effect.fn('withTestServer')(function* (
  runners: readonly ('ios' | 'android')[]
) {
  yield* TestServerControllerServerLive.pipe(Layer.launch, Effect.forkScoped);

  for (const runner of runners) {
    yield* runHarness(runner);
  }
});

const command = Command.make(
  'harness-with-server',
  {
    runners: Flag.choice('harnessRunner', ['ios', 'android']).pipe(Flag.atLeast(1)),
  },
  ({ runners }) => withTestServer(runners).pipe(Effect.scoped)
);

command.pipe(
  Command.run({ version: '0.0.0' }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain({ disableErrorReporting: true })
);
