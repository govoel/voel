import { Option } from 'effect';
import type { NoInfer } from 'effect/Types';
import { Atom } from 'effect/unstable/reactivity';
import type { AtomRegistry } from 'effect/unstable/reactivity';

type AnyAtom = Atom.Atom<unknown>;

export const StatesTypeId: unique symbol = Symbol.for('@repo/atom-devtools-core/States');

export interface PredefinedState<A> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly source: Atom.Atom<A>;
}

export type PredefinedWritableState<R, W> = PredefinedState<R> & {
  readonly source: Atom.Writable<R, W>;
};

type PredefinedSourceFor<T extends AnyAtom> = Atom.Atom<NoInfer<Atom.Type<T>>> &
  (T extends Atom.Writable<infer R, infer W> ? Atom.Writable<NoInfer<R>, NoInfer<W>> : unknown);

export type PredefinedStateFor<T extends AnyAtom> = PredefinedState<NoInfer<Atom.Type<T>>> & {
  readonly source: PredefinedSourceFor<T>;
};

export interface HasPredefinedStates<T extends AnyAtom> {
  readonly [StatesTypeId]: {
    readonly states: () => readonly PredefinedStateFor<T>[];
    readonly activate: (registry: AtomRegistry.AtomRegistry, state: PredefinedStateFor<T>) => void;
    readonly clear: (registry: AtomRegistry.AtomRegistry) => void;
    readonly active: (registry: AtomRegistry.AtomRegistry) => string | undefined;
    readonly refresh: (registry: AtomRegistry.AtomRegistry) => void;
  };
}

export const hasPredefinedStates = <T extends AnyAtom>(
  atom: T
): atom is T & HasPredefinedStates<T> => StatesTypeId in atom;

export const InternalAtomTypeId: unique symbol = Symbol.for(
  '@repo/atom-devtools-core/InternalAtom'
);

export interface InternalAtom {
  readonly [InternalAtomTypeId]: true;
}

const copyWithMetadata = <T extends AnyAtom, M extends object>(atom: T, metadata: M): T & M => {
  // Atom metadata combinators use the same shallow-copy strategy. Object.create
  // cannot retain its generic prototype type without an assertion.
  // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion
  const copy = Object.create(Object.getPrototypeOf(atom)) as T;
  return Object.assign(copy, atom, metadata);
};

export const markInternal = <T extends AnyAtom>(atom: T): T & InternalAtom =>
  copyWithMetadata(atom, { [InternalAtomTypeId]: true as const });

export const isInternal = (atom: AnyAtom): atom is AnyAtom & InternalAtom =>
  InternalAtomTypeId in atom;

function decorate<A, T extends Atom.Atom<A>>(
  atom: T,
  stateThunk: () => readonly PredefinedStateFor<T>[]
): T;
function decorate<A, T extends Atom.Atom<A>>(
  atom: T,
  stateThunk: () => readonly PredefinedStateFor<T>[]
): T {
  let stateCache: readonly PredefinedStateFor<T>[] | undefined = void 0;
  const states = (): readonly PredefinedStateFor<T>[] => (stateCache ??= stateThunk());

  const control = markInternal(
    Atom.make<{ state: Option.Option<PredefinedStateFor<T>> }>({
      state: Option.none(),
    })
  );

  const read = (context: Atom.AtomContext): A => {
    const override = context(control);
    if (Option.isSome(override.state)) {
      return override.state.value.source.read(context);
    }
    return atom.read(context);
  };

  const metadata: HasPredefinedStates<T>[typeof StatesTypeId] = {
    states,
    activate: (registry, state) => {
      registry.update(control, () => ({
        state: Option.some(state),
      }));
    },
    clear: (registry) => {
      registry.update(control, () => ({
        state: Option.none(),
      }));
    },
    active: (registry) =>
      registry.get(control).state.pipe(
        Option.map((state) => state.id),
        Option.getOrUndefined
      ),
    refresh: (registry) => {
      registry.update(control, (current) => ({
        state: current.state,
      }));
    },
  };

  if (!Atom.isWritable(atom)) {
    return copyWithMetadata(atom, { read, [StatesTypeId]: metadata });
  }

  const write = (context: Atom.WriteContext<A>, value: unknown): void => {
    const { state } = context.get(control);
    if (Option.isSome(state)) {
      if (Atom.isWritable(state.value.source)) {
        state.value.source.write(context, value);
        return;
      }
      throw new Error('Predefined state source is not writable');
    }
    atom.write(context, value);
  };

  return copyWithMetadata(atom, { read, write, [StatesTypeId]: metadata });
}

export const makeWithStates =
  (options: { readonly enabled: boolean }) =>
  <T extends AnyAtom>(atom: T, states: () => readonly PredefinedStateFor<NoInfer<T>>[]): T => {
    if (!options.enabled) {
      return atom;
    }

    return decorate(atom, () => states());
  };
