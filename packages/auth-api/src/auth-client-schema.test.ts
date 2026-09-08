import { describe, expect, it } from 'bun:test';

import { Effect, Schema } from 'effect';

import * as AuthClientSchema from '#src/auth-client-schema.ts';

describe('AuthClientSchema.request', () => {
  it('encodes domain input and decodes results on each execution', async () => {
    const inputs: Array<string> = [];
    const request = AuthClientSchema.request({
      Request: Schema.FiniteFromString,
      Result: Schema.FiniteFromString,
      execute: async (input) => {
        inputs.push(input);
        return { data: '42', error: null };
      },
    });
    const effect = request(12);
    expect(inputs).toEqual([]);
    expect(await Effect.runPromise(effect)).toBe(42);
    expect(await Effect.runPromise(effect)).toBe(42);
    expect(inputs).toEqual(['12', '12']);
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
