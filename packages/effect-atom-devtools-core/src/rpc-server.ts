import { Effect, Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';

import { AtomDevTools } from '#src/atom-dev-tools.ts';
import { AtomDevToolsRpc } from '#src/rpc.ts';

const AtomDevToolsRpcHandlers = AtomDevToolsRpc.toLayer(
  Effect.gen(function* () {
    const atomDevTools = yield* AtomDevTools;

    return AtomDevToolsRpc.of({
      catalog: () => atomDevTools.catalog,
      watch: ({ id }) => atomDevTools.watch(id),
      activatePredefinedState: ({ atomId, stateId }) =>
        atomDevTools.activatePredefinedState(atomId, stateId),
      clearPredefinedState: ({ id }) => atomDevTools.clearPredefinedState(id),
      clearAllPredefinedStates: () => atomDevTools.clearAllPredefinedStates(),
      refresh: ({ id }) => atomDevTools.refresh(id),
    });
  })
);

export const AtomDevToolsRpcServerFromService = RpcServer.layer(AtomDevToolsRpc).pipe(
  Layer.provide(AtomDevToolsRpcHandlers)
);

export const AtomDevToolsRpcServer = AtomDevToolsRpcServerFromService.pipe(
  Layer.provide(AtomDevTools.layer)
);
