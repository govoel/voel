import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Layer, Option, Predicate } from 'effect';
import { AsyncResult, Atom, AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient } from 'effect/unstable/rpc';

import type { AtomDevToolsRpcEventMap } from '@repo/atom-devtools-core';
import { AtomDevToolsRpc } from '@repo/atom-devtools-core';

import { makeAtomDevToolsRpcClientProtocol } from '#src/shared/rpc-client.ts';

type RozeniteClient = RozeniteDevToolsClient<AtomDevToolsRpcEventMap>;

const rozeniteClientAtom = Atom.make<Option.Option<RozeniteClient>>(Option.none());

class AtomDevToolsClient extends AtomRpc.Service<AtomDevToolsClient>()(
  '@repo/atom-devtools-plugin/AtomDevToolsClient',
  {
    group: AtomDevToolsRpc,
    protocol: (get) =>
      Layer.effect(
        RpcClient.Protocol,
        Effect.gen(function* () {
          const client = yield* get.some(rozeniteClientAtom);
          return yield* makeAtomDevToolsRpcClientProtocol(client);
        })
      ),
    disableTracing: true,
  }
) {}

export const catalogAtom = AtomDevToolsClient.query('Catalog', void 0);
export const selectedIdAtom = Atom.make<Option.Option<string>>(Option.none());
export const snapshotAtoms = Atom.family((atomId: string) =>
  AtomDevToolsClient.query('WatchAtom', { atomId })
);

export const activateStateMutationAtom = AtomDevToolsClient.mutation('ActivateState');
export const clearAllStatesMutationAtom = AtomDevToolsClient.mutation('ClearAllStates');
export const clearStateMutationAtom = AtomDevToolsClient.mutation('ClearState');
export const refreshAtomMutationAtom = AtomDevToolsClient.mutation('RefreshAtom');

export const searchAtom = Atom.make('');

export const errorMessage = (error: unknown): string => {
  if (Predicate.hasProperty(error, '_tag')) {
    if (error._tag === 'AtomNotFound' && Predicate.hasProperty(error, 'id')) {
      return `Atom "${String(error.id)}" was not found.`;
    }
    if (
      error._tag === 'StateNotFound' &&
      Predicate.hasProperty(error, 'stateId') &&
      Predicate.hasProperty(error, 'atomId')
    ) {
      return `State "${String(error.stateId)}" was not found on atom "${String(error.atomId)}".`;
    }
  }
  if (Predicate.isError(error)) {
    return error.message;
  }
  return String(error);
};

const errorOf = <A>(result: AsyncResult.AsyncResult<A, unknown>): string | undefined =>
  Option.getOrUndefined(Option.map(AsyncResult.error(result), errorMessage));

export const mutationErrorAtom = Atom.make(
  (get) =>
    errorOf(get(activateStateMutationAtom)) ??
    errorOf(get(clearAllStatesMutationAtom)) ??
    errorOf(get(clearStateMutationAtom)) ??
    errorOf(get(refreshAtomMutationAtom))
);

export const mutationPendingAtom = Atom.make(
  (get) =>
    get(activateStateMutationAtom).waiting ||
    get(clearAllStatesMutationAtom).waiting ||
    get(clearStateMutationAtom).waiting ||
    get(refreshAtomMutationAtom).waiting
);

export const selectAtom = Atom.fnSync((atomId: string, get) => {
  get.registry.set(selectedIdAtom, Option.some(atomId));
  get.set(activateStateMutationAtom, Atom.Reset);
  get.set(clearAllStatesMutationAtom, Atom.Reset);
  get.set(clearStateMutationAtom, Atom.Reset);
  get.set(refreshAtomMutationAtom, Atom.Reset);
});

export const backAtom = Atom.fnSync((_: undefined, get) => {
  get.registry.set(selectedIdAtom, Option.none());
  get.set(activateStateMutationAtom, Atom.Reset);
  get.set(clearAllStatesMutationAtom, Atom.Reset);
  get.set(clearStateMutationAtom, Atom.Reset);
  get.set(refreshAtomMutationAtom, Atom.Reset);
});

export const connectPanelAtom = Atom.fn<RozeniteClient>()(
  Effect.fn('PanelModel.connect')(function* (client, get) {
    get.registry.set(rozeniteClientAtom, Option.some(client));
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        const activeClient = get.registry.get(rozeniteClientAtom);
        if (Option.isSome(activeClient) && activeClient.value === client) {
          get.registry.set(rozeniteClientAtom, Option.none());
        }
      })
    );
    return yield* Effect.never;
  })
);
