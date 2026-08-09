import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Layer, Option, Stream } from 'effect';
import { Atom, AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient } from 'effect/unstable/rpc';

import type { AtomId } from '@repo/effect-atom-devtools-core/atom-dev-tools';
import { AtomDevToolsRpc } from '@repo/effect-atom-devtools-core/rpc';

import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';
import type { EffectRpcEventMap } from '#src/shared/rpc-messages.ts';
import { makeRozeniteRpcClientProtocol } from '#src/ui/rpc-client-protocol.ts';

const RozeniteRpcClientProtocolLive = Layer.effect(
  RpcClient.Protocol,
  Effect.gen(function* () {
    const rozeniteClient = yield* Effect.acquireRelease(
      Effect.tryPromise(async () =>
        getRozeniteDevToolsClient<EffectRpcEventMap>(EFFECT_ATOM_DEVTOOLS_PLUGIN_ID)
      ),
      (client) =>
        Effect.sync(() => {
          client.close();
        })
    );

    return yield* makeRozeniteRpcClientProtocol(rozeniteClient);
  })
);

class AtomDevToolsClient extends AtomRpc.Service<AtomDevToolsClient>()(
  '@repo/effect-atom-devtools-rozenite/ui/model/AtomDevToolsClient',
  {
    group: AtomDevToolsRpc,
    protocol: RozeniteRpcClientProtocolLive,
  }
) {}

export const activatePredefinedStateAtom = AtomDevToolsClient.mutation('activatePredefinedState');
export const clearPredefinedStateAtom = AtomDevToolsClient.mutation('clearPredefinedState');
export const clearAllPredefinedStatesAtom = AtomDevToolsClient.mutation('clearAllPredefinedStates');
export const refreshAtom = AtomDevToolsClient.mutation('refresh');

export const selectedAtomIdAtom = Atom.make<Option.Option<AtomId>>(Option.none());

export const catalogAtom = AtomDevToolsClient.runtime.atom(
  Stream.unwrap(AtomDevToolsClient.use((client) => Effect.succeed(client('catalog', void 0))))
);

export const snapshotAtom = Atom.family((atomId: AtomId) =>
  AtomDevToolsClient.runtime.atom(
    Stream.unwrap(AtomDevToolsClient.use((client) => Effect.succeed(client('watch', { atomId }))))
  )
);
