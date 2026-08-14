import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Layer, Option, Stream } from 'effect';
import { Atom, AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient } from 'effect/unstable/rpc';

import type { AtomId } from '@repo/effect-atom-devtools-core/atom-dev-tools';
import { AtomDevToolsRpc } from '@repo/effect-atom-devtools-core/rpc';

import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';
import { makeRpcClientProtocol } from '#src/ui/rpc/protocol.ts';

const RozeniteRpcClientProtocolLayer = Layer.effect(
  RpcClient.Protocol,
  Effect.gen(function* () {
    const bridgeClient = yield* Effect.acquireRelease(
      Effect.tryPromise(async () =>
        getRozeniteDevToolsClient<RpcBridgeEventMap>(EFFECT_ATOM_DEVTOOLS_PLUGIN_ID)
      ),
      (client) =>
        Effect.sync(() => {
          client.close();
        })
    );

    return yield* makeRpcClientProtocol(bridgeClient);
  })
);

class AtomDevToolsRpcClient extends AtomRpc.Service<AtomDevToolsRpcClient>()(
  '@repo/effect-atom-devtools-rozenite/ui/atoms/AtomDevToolsRpcClient',
  {
    group: AtomDevToolsRpc,
    protocol: RozeniteRpcClientProtocolLayer,
  }
) {}

export const activatePredefinedStateMutation =
  AtomDevToolsRpcClient.mutation('activatePredefinedState');
export const clearPredefinedStateMutation = AtomDevToolsRpcClient.mutation('clearPredefinedState');
export const clearAllPredefinedStatesMutation = AtomDevToolsRpcClient.mutation(
  'clearAllPredefinedStates'
);
export const refreshAtomMutation = AtomDevToolsRpcClient.mutation('refresh');

export const selectedAtomIdAtom = Atom.make<Option.Option<AtomId>>(Option.none());

export const atomCatalogAtom = AtomDevToolsRpcClient.runtime.atom(
  Stream.unwrap(AtomDevToolsRpcClient.use((client) => Effect.succeed(client('catalog', void 0))))
);

export const atomSnapshotAtomFamily = Atom.family((atomId: AtomId) =>
  AtomDevToolsRpcClient.runtime.atom(
    Stream.unwrap(
      AtomDevToolsRpcClient.use((client) => Effect.succeed(client('watch', { atomId })))
    )
  )
);
