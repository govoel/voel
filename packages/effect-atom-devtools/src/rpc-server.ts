import { Effect, Layer, Option, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';

import { AtomDevTools, AtomId, AtomNotFound } from '#src/atom-dev-tools.ts';
import { AtomDevToolsRpc } from '#src/rpc.ts';

export interface AtomDevToolsRpcServerTransport {
  readonly run: (
    handler: (message: FromClientEncoded) => Effect.Effect<void>
  ) => Effect.Effect<never, never, Scope.Scope>;
  readonly send: (message: FromServerEncoded) => Effect.Effect<void>;
}

const getSnapshot = Effect.fn('AtomDevToolsRpcServer.getSnapshot')(function* (
  service: AtomDevTools['Service'],
  atomId: string
) {
  const id = AtomId.make(atomId);
  const snapshot = yield* service.watch(id).pipe(Stream.runHead);
  const value = yield* Option.match(snapshot, {
    onNone: () => Effect.fail(new AtomNotFound({ id })),
    onSome: Effect.succeed,
  });
  return value;
});

export const makeAtomDevToolsRpcHandlers = (service: AtomDevTools['Service']) =>
  AtomDevToolsRpc.of({
    Catalog: () => service.catalog,
    GetAtom: ({ atomId }) => getSnapshot(service, atomId),
    WatchAtom: ({ atomId }) => service.watch(AtomId.make(atomId)),
    ActivateState: ({ atomId, stateId }) =>
      service.activateState(AtomId.make(atomId), stateId).pipe(Effect.as({})),
    ClearState: ({ atomId }) => service.clearState(AtomId.make(atomId)).pipe(Effect.as({})),
    ClearAllStates: () => service.clearAllStates().pipe(Effect.as({})),
    RefreshAtom: ({ atomId }) => service.refresh(AtomId.make(atomId)).pipe(Effect.as({})),
  });

export const AtomDevToolsRpcHandlers = AtomDevToolsRpc.toLayer(
  Effect.gen(function* () {
    return makeAtomDevToolsRpcHandlers(yield* AtomDevTools);
  })
);

export const makeAtomDevToolsRpcServerProtocol = Effect.fn('AtomDevToolsRpcServer.makeProtocol')(
  function* (transport: AtomDevToolsRpcServerTransport) {
    const disconnects = yield* Queue.unbounded<number>();
    const clientIds = new Set([0]);

    return yield* RpcServer.Protocol.make((writeRequest) =>
      Effect.gen(function* () {
        yield* transport
          .run((message) => writeRequest(0, message))
          .pipe(
            Effect.ensuring(
              Effect.sync(() => {
                clientIds.delete(0);
                Queue.offerUnsafe(disconnects, 0);
              })
            ),
            Effect.forkScoped
          );

        return {
          disconnects,
          send: (_clientId, response) => transport.send(response),
          end: (_clientId) => Effect.void,
          clientIds: Effect.sync(() => clientIds),
          initialMessage: Effect.succeedNone,
          supportsAck: true,
          supportsTransferables: false,
          supportsSpanPropagation: false,
        };
      })
    );
  }
);

export const serveAtomDevToolsRpc = Effect.fn('AtomDevToolsRpcServer.serve')(function* (
  transport: AtomDevToolsRpcServerTransport
) {
  const protocol = yield* makeAtomDevToolsRpcServerProtocol(transport);
  return yield* RpcServer.make(AtomDevToolsRpc, {
    concurrency: 'unbounded',
    disableTracing: true,
  }).pipe(
    Effect.provideService(RpcServer.Protocol, protocol),
    Effect.provide(AtomDevToolsRpcHandlers)
  );
});

export const layerAtomDevToolsRpcServer = (
  transport: AtomDevToolsRpcServerTransport
): Layer.Layer<never, never, AtomDevTools> =>
  Layer.effectDiscard(Effect.forkScoped(serveAtomDevToolsRpc(transport)));
