import { Function, Option } from 'effect';
import type { NoInfer } from 'effect/Types';
import { Atom } from 'effect/unstable/reactivity';
import type { AtomRegistry } from 'effect/unstable/reactivity';

type AnyAtom = Atom.Atom<unknown>;

export const PredefinedStatesTypeId: unique symbol = Symbol.for(
  '@repo/effect-atom-devtools-core/PredefinedStates'
);

interface PredefinedStateFor<T extends AnyAtom> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly source: Atom.Atom<NoInfer<Atom.Type<T>>> &
    (T extends Atom.Writable<infer R, infer W> ? Atom.Writable<NoInfer<R>, NoInfer<W>> : unknown);
}

interface HasPredefinedStates<T extends AnyAtom> {
  readonly [PredefinedStatesTypeId]: {
    readonly getStates: () => readonly PredefinedStateFor<T>[];
    readonly activate: (registry: AtomRegistry.AtomRegistry, state: PredefinedStateFor<T>) => void;
    readonly clear: (registry: AtomRegistry.AtomRegistry) => void;
    readonly getActiveStateId: (registry: AtomRegistry.AtomRegistry) => Option.Option<string>;
    readonly readActiveStateId: (get: Atom.AtomContext) => Option.Option<string>;
    readonly refresh: (registry: AtomRegistry.AtomRegistry) => void;
  };
}

export const hasPredefinedStates = <T extends AnyAtom>(
  atom: T
): atom is T & HasPredefinedStates<T> => PredefinedStatesTypeId in atom;

const InternalAtomTypeId: unique symbol = Symbol.for(
  '@repo/effect-atom-devtools-core/InternalAtom'
);

const copyWithMetadata = <T extends AnyAtom, M extends object>(atom: T, metadata: M): T & M => {
  // Atom metadata combinators use the same shallow-copy strategy. Object.create
  // cannot retain its generic prototype type without an assertion.
  // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion
  const copy = Object.create(Object.getPrototypeOf(atom)) as T;
  return Object.assign(copy, atom, metadata);
};

export const markInternalAtom = <T extends AnyAtom>(
  atom: T
): T & { readonly [InternalAtomTypeId]: true } =>
  copyWithMetadata(atom, { [InternalAtomTypeId]: true as const });

export const isInternalAtom = (
  atom: AnyAtom
): atom is AnyAtom & { readonly [InternalAtomTypeId]: true } => InternalAtomTypeId in atom;

function withPredefinedStates<A, T extends Atom.Atom<A>>(
  atom: T,
  getPredefinedStates: () => readonly PredefinedStateFor<T>[]
): T;
function withPredefinedStates<A, T extends Atom.Atom<A>>(
  atom: T,
  getPredefinedStates: () => readonly PredefinedStateFor<T>[]
): T {
  let cachedPredefinedStates: readonly PredefinedStateFor<T>[] | undefined = void 0;
  const predefinedStates = (): readonly PredefinedStateFor<T>[] =>
    (cachedPredefinedStates ??= getPredefinedStates());

  const activeStateAtom = markInternalAtom(
    Atom.make<{ activeState: Option.Option<PredefinedStateFor<T>> }>({
      activeState: Option.none(),
    })
  );

  const read = (get: Atom.AtomContext): A => {
    const { activeState } = get(activeStateAtom);
    if (Option.isSome(activeState)) {
      return activeState.value.source.read(get);
    }
    return atom.read(get);
  };

  const predefinedStatesMetadata: HasPredefinedStates<T>[typeof PredefinedStatesTypeId] = {
    getStates: predefinedStates,
    activate: (registry, state) => {
      registry.update(activeStateAtom, () => ({
        activeState: Option.some(state),
      }));
    },
    clear: (registry) => {
      registry.update(activeStateAtom, () => ({
        activeState: Option.none(),
      }));
    },
    getActiveStateId: (registry) =>
      registry.get(activeStateAtom).activeState.pipe(Option.map((state) => state.id)),
    readActiveStateId: (get) =>
      get(activeStateAtom).activeState.pipe(Option.map((state) => state.id)),
    refresh: (registry) => {
      registry.update(activeStateAtom, (current) => ({
        activeState: current.activeState,
      }));
    },
  };

  if (!Atom.isWritable(atom)) {
    return copyWithMetadata(atom, {
      read,
      [PredefinedStatesTypeId]: predefinedStatesMetadata,
    });
  }

  const write = (ctx: Atom.WriteContext<A>, value: unknown): void => {
    const { activeState } = ctx.get(activeStateAtom);
    if (Option.isSome(activeState)) {
      if (Atom.isWritable(activeState.value.source)) {
        activeState.value.source.write(ctx, value);
        return;
      }
      throw new Error('Predefined state source is not writable');
    }
    atom.write(ctx, value);
  };

  return copyWithMetadata(atom, {
    read,
    write,
    [PredefinedStatesTypeId]: predefinedStatesMetadata,
  });
}

export const makeWithPredefinedStates = (options: {
  readonly enabled: boolean;
}): {
  <T extends AnyAtom>(getStates: () => readonly PredefinedStateFor<NoInfer<T>>[]): (atom: T) => T;
  <T extends AnyAtom>(atom: T, getStates: () => readonly PredefinedStateFor<NoInfer<T>>[]): T;
} =>
  Function.dual(
    2,
    <T extends AnyAtom>(atom: T, getStates: () => readonly PredefinedStateFor<NoInfer<T>>[]): T => {
      if (!options.enabled) {
        return atom;
      }

      return withPredefinedStates(atom, getStates);
    }
  );
