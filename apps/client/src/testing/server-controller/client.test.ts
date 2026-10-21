/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunServices } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';

// Run real child processes with controlled startup behavior through the same controller.
const withChild = (source: string) =>
  TestServerControllerClient.layerNoDeps.pipe(
    Layer.provide(
      Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.ChildProcessSpawner.pipe(
          Effect.map((spawner) =>
            ChildProcessSpawner.make(() => spawner.spawn(ChildProcess.make('bun', ['-e', source])))
          )
        )
      )
    ),
    Layer.provide(BunServices.layer)
  );

it.effect(
  'starts isolated loopback servers whose application routes are already ready',
  Effect.fnUntraced(
    function* () {
      const controller = yield* TestServerControllerClient;
      const httpClient = yield* HttpClient.HttpClient;
      const urls = yield* Effect.all([controller.start, controller.start], {
        concurrency: 'unbounded',
      });
      expect(new Set(urls).size).toBe(2);
      yield* Effect.forEach(urls, (url) =>
        Effect.gen(function* () {
          expect(new URL(url).hostname).toBe('127.0.0.1');
          expect(Number(new URL(url).port)).toBeGreaterThan(0);
          const response = yield* httpClient.get(`${url}/api/auth/get-session`);
          expect(response.status).toBe(200);
          expect(yield* response.json).toBeNull();
        })
      );
    },
    (effect) =>
      effect.pipe(
        Effect.provide(Layer.mergeAll(TestServerControllerClient.layer, FetchHttpClient.layer))
      )
  )
);

it.effect(
  'fails on child exit with bounded startup diagnostics instead of waiting for readiness',
  Effect.fnUntraced(
    function* () {
      const controller = yield* TestServerControllerClient;
      const error = yield* controller.start.pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'TestServerStartupError',
        message: 'Test server exited before readiness (code 7)',
      });
      if (error._tag === 'TestServerStartupError') {
        expect(error.output).toContain('startup failed');
        expect(error.output.length).toBeLessThanOrEqual(16_384);
      }
    },
    (effect) =>
      effect.pipe(
        Effect.provide(
          withChild('console.error("x".repeat(40_000) + "startup failed"); process.exit(7)')
        )
      )
  )
);

it.effect(
  'preserves startup diagnostics when the child terminates by signal',
  Effect.fnUntraced(
    function* () {
      const controller = yield* TestServerControllerClient;
      const error = yield* controller.start.pipe(Effect.flip);
      expect(error._tag).toBe('TestServerStartupError');
      if (error._tag === 'TestServerStartupError') {
        expect(error.message).toContain('SIGTERM');
        expect(error.output).toContain('interrupted startup');
      }
    },
    (effect) =>
      effect.pipe(
        Effect.provide(
          withChild('console.error("interrupted startup"); process.kill(process.pid, "SIGTERM")')
        )
      )
  )
);

it.effect(
  'bounds startup when a live child never reports valid readiness',
  Effect.fnUntraced(
    function* () {
      const controller = yield* TestServerControllerClient;
      const error = yield* controller.start.pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'TestServerStartupError',
        message: 'Test server did not become ready within 10 seconds',
      });
      if (error._tag === 'TestServerStartupError') {
        expect(error.output).toContain('not ready');
      }
    },
    (effect) =>
      effect.pipe(
        Effect.provide(
          withChild(
            'console.log("not ready"); console.log(JSON.stringify({type:"ready",url:"invalid"})); setInterval(() => {}, 1000)'
          )
        )
      )
  ),
  { timeout: 15_000 }
);
