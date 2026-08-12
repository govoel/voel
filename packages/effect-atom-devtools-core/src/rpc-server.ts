import { Effect, Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';

import { AtomDevTools } from '#src/atom-dev-tools.ts';
import { AtomDevToolsRpc } from '#src/rpc.ts';

const AtomDevToolsRpcHandlers = AtomDevToolsRpc.toLayer(
  Effect.gen(function* () {
    const atomDevTools = yield* AtomDevTools;

    return AtomDevToolsRpc.of({
      catalog: () => atomDevTools.catalog,
      watch: ({ atomId }) => atomDevTools.watch(atomId),
      activatePredefinedState: ({ atomId, stateId }) =>
        atomDevTools.activatePredefinedState(atomId, stateId),
      clearPredefinedState: ({ atomId }) => atomDevTools.clearPredefinedState(atomId),
      clearAllPredefinedStates: () => atomDevTools.clearAllPredefinedStates,
      refresh: ({ atomId }) => atomDevTools.refresh(atomId),
    });
  })
);

export const AtomDevToolsRpcServer = RpcServer.layer(AtomDevToolsRpc).pipe(
  Layer.provide(AtomDevToolsRpcHandlers)
);
