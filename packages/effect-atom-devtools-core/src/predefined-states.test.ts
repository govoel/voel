import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import {
  PredefinedStatesTypeId,
  hasPredefinedStates,
  isInternalAtom,
  makeWithPredefinedStates,
  markInternalAtom,
} from '#src/predefined-states.ts';

describe('makeWithPredefinedStates', () => {
  it('is an identity and does not evaluate states when disabled', () => {
    const atom = Atom.make(1);
    let evaluated = false;
    const withPredefinedStates = makeWithPredefinedStates({ enabled: false });

    const result = withPredefinedStates(atom, () => {
      evaluated = true;
      return [];
    });

    expect(result).toBe(atom);
    expect(evaluated).toBe(false);
    expect(hasPredefinedStates(result)).toBe(false);
  });

  it('can be used in a pipe', () => {
    const alternate = Atom.make(2);
    const atom = Atom.make(1).pipe(
      makeWithPredefinedStates({ enabled: true })(() => [
        { id: 'alternate', label: 'Alternate', atom: alternate },
      ])
    );
    const writable: Atom.Writable<number, number> = atom;
    void writable;

    expect(hasPredefinedStates(atom)).toBe(true);
  });

  it('caches states and switches read and write programs', () => {
    const registry = AtomRegistry.make();
    const original = Atom.make(1);
    const alternate = Atom.make(10);
    let evaluations = 0;
    const atom = makeWithPredefinedStates({ enabled: true })(original, () => {
      evaluations += 1;
      return [{ id: 'alternate', label: 'Alternate', atom: alternate }];
    });

    expect(Atom.isWritable(atom)).toBe(true);
    expect(registry.get(atom)).toBe(1);
    expect(hasPredefinedStates(atom)).toBe(true);
    if (!hasPredefinedStates(atom)) {
      throw new Error('Expected atom to have predefined states');
    }

    const metadata = atom[PredefinedStatesTypeId];
    expect(metadata.getStates()).toBe(metadata.getStates());
    expect(evaluations).toBe(1);

    metadata.activate(registry, Option.getOrThrow(Option.fromNullishOr(metadata.getStates()[0])));
    expect(registry.get(atom)).toBe(10);
    expect(metadata.getActiveStateId(registry)).toEqual(Option.some('alternate'));

    registry.set(atom, 12);
    expect(registry.get(atom)).toBe(12);
    expect(registry.get(original)).toBe(1);
    expect(registry.get(alternate)).toBe(10);

    metadata.refresh(registry);
    expect(registry.get(atom)).toBe(10);

    metadata.clear(registry);
    expect(metadata.getActiveStateId(registry)).toEqual(Option.none());
    expect(registry.get(atom)).toBe(1);
  });

  it('reads an inactive predefined state without creating its control node', () => {
    const registry = AtomRegistry.make();
    const atom = makeWithPredefinedStates({ enabled: true })(Atom.make(1), () => []);

    expect(hasPredefinedStates(atom)).toBe(true);
    if (!hasPredefinedStates(atom)) {
      throw new Error('Expected atom to have predefined states');
    }

    expect(registry.getNodes().size).toBe(0);
    expect(atom[PredefinedStatesTypeId].getActiveStateId(registry)).toEqual(Option.none());
    expect(registry.getNodes().size).toBe(0);
  });

  it('clears an active state when the decorated atom becomes inactive', () => {
    const scheduled = new Set<() => void>();
    const registry = AtomRegistry.make({
      scheduleTask: (task) => {
        scheduled.add(task);
        return () => {
          scheduled.delete(task);
        };
      },
    });
    const atom = makeWithPredefinedStates({ enabled: true })(Atom.make('normal'), () => [
      { id: 'alternate', label: 'Alternate', atom: Atom.make('alternate') },
    ]);

    expect(registry.get(atom)).toBe('normal');

    expect(hasPredefinedStates(atom)).toBe(true);
    if (!hasPredefinedStates(atom)) {
      throw new Error('Expected atom to have predefined states');
    }

    const state = Option.getOrThrow(
      Option.fromNullishOr(atom[PredefinedStatesTypeId].getStates()[0])
    );
    atom[PredefinedStatesTypeId].activate(registry, state);
    expect(registry.get(atom)).toBe('alternate');

    for (const task of scheduled) {
      task();
    }

    expect(registry.get(atom)).toBe('normal');

    registry.dispose();
  });

  it('finalizes an active state atom before starting the next state atom', () => {
    const registry = AtomRegistry.make();
    const finalized: Array<string> = [];
    const makeStateAtom = (name: string) =>
      Atom.make(
        Effect.acquireRelease(Effect.succeed(name), () => Effect.sync(() => finalized.push(name)))
      );
    const atom = makeWithPredefinedStates({ enabled: true })(
      Atom.make(Effect.succeed('original')),
      () => [
        { id: 'one', label: 'One', atom: makeStateAtom('one') },
        { id: 'two', label: 'Two', atom: makeStateAtom('two') },
      ]
    );

    registry.get(atom);
    if (!hasPredefinedStates(atom)) {
      throw new Error('Expected atom to have predefined states');
    }
    const states = atom[PredefinedStatesTypeId].getStates();
    atom[PredefinedStatesTypeId].activate(
      registry,
      Option.getOrThrow(Option.fromNullishOr(states[0]))
    );
    registry.get(atom);
    atom[PredefinedStatesTypeId].activate(
      registry,
      Option.getOrThrow(Option.fromNullishOr(states[1]))
    );
    registry.get(atom);
    expect(finalized).toContain('one');

    registry.dispose();
    expect(finalized).toContain('two');
  });
});

describe('internal atoms', () => {
  it('marks a shallow atom copy', () => {
    const atom = Atom.make(1);
    const internal = markInternalAtom(atom);

    expect(internal).not.toBe(atom);
    expect(isInternalAtom(atom)).toBe(false);
    expect(isInternalAtom(internal)).toBe(true);
  });
});

// Compile-time checks for predefined-state atom compatibility.
const withPredefinedStates = makeWithPredefinedStates({ enabled: true });
const writableNumber = Atom.make(1);
const writableWithStringInput = Atom.writable(
  () => 1,
  (_context, _value: string) => {
    void _context;
    void _value;
  }
);
const readOnlyNumber = Atom.make(() => 1);

withPredefinedStates(writableNumber, () => [{ id: 'valid', label: 'Valid', atom: Atom.make(2) }]);
withPredefinedStates(readOnlyNumber, () => [{ id: 'valid', label: 'Valid', atom: Atom.make(2) }]);
withPredefinedStates(writableWithStringInput, () => [
  {
    id: 'valid',
    label: 'Valid',
    atom: Atom.writable(
      () => 2,
      (_context, _value: string) => {
        void _context;
        void _value;
      }
    ),
  },
]);

const decoratedWritable = withPredefinedStates(writableWithStringInput, () => [
  {
    id: 'valid',
    label: 'Valid',
    atom: Atom.writable(
      () => 2,
      (_context, _value: string) => {
        void _context;
        void _value;
      }
    ),
  },
]);
if (!hasPredefinedStates(decoratedWritable)) {
  throw new Error('Expected atom to have predefined states');
}
const state = Option.getOrThrow(
  Option.fromNullishOr(decoratedWritable[PredefinedStatesTypeId].getStates()[0])
);
const stateAtom: Atom.Writable<number, string> = state.atom;
void stateAtom;

withPredefinedStates(writableNumber, () => [
  // @ts-expect-error A writable decorated atom requires a writable state atom.
  { id: 'invalid', label: 'Invalid', atom: readOnlyNumber },
]);
withPredefinedStates(readOnlyNumber, () => [
  // @ts-expect-error A state atom must have a compatible read type.
  { id: 'invalid', label: 'Invalid', atom: Atom.make('wrong') },
]);
withPredefinedStates(writableWithStringInput, () => [
  // @ts-expect-error A writable state atom must accept the decorated atom's write input.
  { id: 'invalid', label: 'Invalid', atom: Atom.make(2) },
]);
