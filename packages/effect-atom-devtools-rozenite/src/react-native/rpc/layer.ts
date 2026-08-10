import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';

import { AtomDevToolsRpcServer } from '@repo/effect-atom-devtools-core/rpc-server';

import { makeRpcServerProtocol } from '#src/react-native/rpc/protocol.ts';
import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

const RozeniteRpcServerProtocolLive = Layer.effect(
  RpcServer.Protocol,
  Effect.gen(function* () {
    const bridgeClient = yield* Effect.acquireRelease(
      Effect.promise(async () =>
        getRozeniteDevToolsClient<RpcBridgeEventMap>(EFFECT_ATOM_DEVTOOLS_PLUGIN_ID)
      ),
      (client) =>
        Effect.sync(() => {
          client.close();
        })
    );

    return yield* makeRpcServerProtocol(bridgeClient);
  })
);

export const RpcServerLayer = Layer.effectDiscard(
  Layer.build(AtomDevToolsRpcServer.pipe(Layer.provide(RozeniteRpcServerProtocolLive))).pipe(
    Effect.forkScoped
  )
);
