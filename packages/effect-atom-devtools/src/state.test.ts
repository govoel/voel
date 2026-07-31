import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import {
  StatesTypeId,
  hasPredefinedStates,
  isInternal,
  makeWithStates,
  markInternal,
} from '#src/state.ts';

describe('makeWithStates', () => {
  it('is an identity and does not evaluate states when disabled', () => {
    const atom = Atom.make(1);
    let evaluated = false;
    const withStates = makeWithStates({ enabled: false });

    const result = withStates(atom, () => {
      evaluated = true;
      return [];
    });

    expect(result).toBe(atom);
    expect(evaluated).toBe(false);
    expect(hasPredefinedStates(result)).toBe(false);
  });

  it('caches states and switches read and write programs', () => {
    const registry = AtomRegistry.make();
    const original = Atom.make(1);
    const alternate = Atom.make(10);
    let evaluations = 0;
    const atom = makeWithStates({ enabled: true })(original, () => {
      evaluations += 1;
      return [{ id: 'alternate', label: 'Alternate', source: alternate }];
    });

    expect(Atom.isWritable(atom)).toBe(true);
    expect(registry.get(atom)).toBe(1);
    expect(hasPredefinedStates(atom)).toBe(true);
    if (!hasPredefinedStates(atom)) {
      return;
    }

    const metadata = atom[StatesTypeId];
    expect(metadata.states()).toBe(metadata.states());
    expect(evaluations).toBe(1);

    metadata.activate(registry, Option.getOrThrow(Option.fromNullishOr(metadata.states()[0])));
    expect(registry.get(atom)).toBe(10);
    expect(metadata.active(registry)).toBe('alternate');

    registry.set(atom, 12);
    expect(registry.get(atom)).toBe(12);
    expect(registry.get(original)).toBe(1);
    expect(registry.get(alternate)).toBe(10);

    metadata.refresh(registry);
    expect(registry.get(atom)).toBe(10);

    metadata.clear(registry);
    expect(metadata.active(registry)).toBeUndefined();
    expect(registry.get(atom)).toBe(1);
  });

  it.effect('finalizes an active source before starting the next source', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const finalized: string[] = [];
      const source = (name: string) =>
        Atom.make(
          Effect.acquireRelease(Effect.succeed(name), () => Effect.sync(() => finalized.push(name)))
        );
      const atom = makeWithStates({ enabled: true })(Atom.make(Effect.succeed('original')), () => [
        { id: 'one', label: 'One', source: source('one') },
        { id: 'two', label: 'Two', source: source('two') },
      ]);

      registry.get(atom);
      if (!hasPredefinedStates(atom)) {
        return;
      }
      const states = atom[StatesTypeId].states();
      atom[StatesTypeId].activate(registry, Option.getOrThrow(Option.fromNullishOr(states[0])));
      registry.get(atom);
      yield* Effect.yieldNow;

      atom[StatesTypeId].activate(registry, Option.getOrThrow(Option.fromNullishOr(states[1])));
      registry.get(atom);
      expect(finalized).toContain('one');

      registry.dispose();
      expect(finalized).toContain('two');
    })
  );
});

describe('internal atoms', () => {
  it('marks a shallow atom copy', () => {
    const atom = Atom.make(1);
    const internal = markInternal(atom);

    expect(internal).not.toBe(atom);
    expect(isInternal(atom)).toBe(false);
    expect(isInternal(internal)).toBe(true);
  });
});

// Compile-time checks for writable source compatibility.
const withStates = makeWithStates({ enabled: true });
const writableNumber = Atom.make(1);
const writableWithStringInput = Atom.writable(
  () => 1,
  (_context, _value: string) => {
    void _context;
    void _value;
  }
);
const readOnlyNumber = Atom.make(() => 1);

withStates(writableNumber, () => [{ id: 'valid', label: 'Valid', source: Atom.make(2) }]);
withStates(readOnlyNumber, () => [{ id: 'valid', label: 'Valid', source: Atom.make(2) }]);
withStates(writableWithStringInput, () => [
  {
    id: 'valid',
    label: 'Valid',
    source: Atom.writable(
      () => 2,
      (_context, _value: string) => {
        void _context;
        void _value;
      }
    ),
  },
]);

const decoratedWritable = withStates(writableWithStringInput, () => [
  {
    id: 'valid',
    label: 'Valid',
    source: Atom.writable(
      () => 2,
      (_context, _value: string) => {
        void _context;
        void _value;
      }
    ),
  },
]);
if (hasPredefinedStates(decoratedWritable)) {
  const state = Option.getOrThrow(
    Option.fromNullishOr(decoratedWritable[StatesTypeId].states()[0])
  );
  const source: Atom.Writable<number, string> = state.source;
  void source;
}

// @ts-expect-error A writable decorated atom requires a writable source.
withStates(writableNumber, () => [{ id: 'invalid', label: 'Invalid', source: readOnlyNumber }]);
// @ts-expect-error A source must have a compatible read type.
withStates(readOnlyNumber, () => [{ id: 'invalid', label: 'Invalid', source: Atom.make('wrong') }]);
withStates(writableWithStringInput, () => [
  // @ts-expect-error A writable source must accept the decorated atom's write input.
  { id: 'invalid', label: 'Invalid', source: Atom.make(2) },
]);
