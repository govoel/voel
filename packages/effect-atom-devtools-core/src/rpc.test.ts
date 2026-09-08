import { expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { AtomId } from '#src/atom-dev-tools.ts';
import { ActivatePredefinedStateInput, AtomDevToolsAtomInput } from '#src/rpc.ts';

it.effect('decodes and encodes structural atom commands', () =>
  Effect.gen(function* () {
    const atomId = AtomId.make('runtime:1');
    const input = { atomId, stateId: 'loading' } satisfies typeof ActivatePredefinedStateInput.Type;

    const atom = yield* AtomDevToolsAtomInput.decodeUnknownEffect({ atomId });
    const activation = yield* ActivatePredefinedStateInput.decodeUnknownEffect(input);
    const encoded = yield* Schema.encodeEffect(ActivatePredefinedStateInput)(activation);

    expect(atom).toStrictEqual({ atomId });
    expect(activation).toStrictEqual(input);
    expect(encoded).toStrictEqual(input);
  })
);

it.each([
  { stateId: 'loading' },
  { atomId: 'runtime:1' },
  { atomId: 1, stateId: 'loading' },
  { atomId: 'runtime:1', stateId: 1 },
])('rejects invalid activation input %j', (input) => {
  expect(() => Schema.decodeUnknownSync(ActivatePredefinedStateInput)(input)).toThrow();
});
