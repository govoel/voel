import { describe, expect, it } from 'bun:test';

import { Array, Deferred, Effect, Exit, Fiber, Option, Schema } from 'effect';

import * as AuthClientSchema from '#src/auth-client-schema.ts';

describe('AuthClientSchema.request', () => {
  it('encodes domain input and decodes results on each execution', async () => {
    const inputs: Array<string> = [];
    const signals: Array<AbortSignal> = [];
    const request = AuthClientSchema.request({
      Request: Schema.FiniteFromString,
      Result: Schema.FiniteFromString,
      execute: async ({ request: input, signal }) => {
        inputs.push(input);
        signals.push(signal);
        return { data: '42', error: null };
      },
    });
    const effect = request(12);
    expect(inputs).toEqual([]);
    expect(await Effect.runPromise(effect)).toBe(42);
    expect(await Effect.runPromise(effect)).toBe(42);
    expect(inputs).toEqual(['12', '12']);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(Array.every(signals, (signal) => !signal.aborted)).toBe(true);
  });

  it('aborts the request on interruption without turning it into a transport failure', async () => {
    await Effect.gen(function* () {
      const runPromise = Effect.runPromiseWith(yield* Effect.context());
      const started = yield* Deferred.make<AbortSignal>();
      const request = AuthClientSchema.request({
        Request: Schema.Void,
        Result: Schema.String,
        execute: async ({ signal }) => {
          const pending = runPromise(Effect.never, { signal });
          Deferred.doneUnsafe(started, Effect.succeed(signal));
          return pending;
        },
      });
      const fiber = yield* request().pipe(Effect.forkChild);
      const signal = yield* Deferred.await(started);
      expect(signal.aborted).toBe(false);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(signal.aborted).toBe(true);
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(Exit.findErrorOption(exit)).toEqual(Option.none());
    }).pipe(Effect.runPromise);
  });

  it('rejects invalid domain input without executing the request', async () => {
    let executed = false;
    const request = AuthClientSchema.request({
      Request: Schema.FiniteFromString.check(Schema.isGreaterThan(0)),
      Result: Schema.String,
      execute: async () => {
        executed = true;
        return { data: 'ok', error: null };
      },
    });
    expect(await Effect.runPromise(Effect.flip(request(-1)))).toMatchObject({
      _tag: 'AuthError',
      reason: { _tag: 'InvalidAuthInputError' },
    });
    expect(executed).toBe(false);
  });

  for (const { name, execute, reason } of [
    {
      name: 'transport rejection',
      execute: async () => {
        throw new Error('offline');
      },
      reason: { _tag: 'AuthTransportError' },
    },
    {
      name: 'API error',
      execute: async () => ({
        data: null,
        error: { code: 'UNAUTHORIZED', status: 401, statusText: 'Unauthorized' },
      }),
      reason: { _tag: 'BetterAuthApiError', code: 'UNAUTHORIZED', status: 401 },
    },
    {
      name: 'malformed API error',
      execute: async () => ({ data: 'ok', error: { message: 'invalid' } }),
      reason: { _tag: 'InvalidAuthResponseError' },
    },
    {
      name: 'empty response',
      execute: async () => ({ data: null, error: null }),
      reason: { _tag: 'InvalidAuthResponseError' },
    },
  ]) {
    it(`maps ${name} to AuthError`, async () => {
      const request = AuthClientSchema.request({
        Request: Schema.Void,
        Result: Schema.String,
        execute,
      });
      expect(await Effect.runPromise(Effect.flip(request()))).toMatchObject({
        _tag: 'AuthError',
        reason,
      });
    });
  }
});
