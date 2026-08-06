import { Effect, Layer, Option, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';

import {
  ActivateState,
  AtomDevTools,
  AtomId,
  AtomNotFound,
  AtomSnapshot,
  AtomSummary,
  ClearAllStates,
  ClearState,
  Refresh,
} from '#src/atom-dev-tools.ts';
import { AtomDevToolsRpc } from '#src/rpc.ts';

export interface AtomDevToolsRpcServerTransport {
  readonly run: (
    handler: (message: FromClientEncoded) => Effect.Effect<void>
  ) => Effect.Effect<never, never, Scope.Scope>;
  readonly send: (message: FromServerEncoded) => Effect.Effect<void>;
}

const currentCatalog = (service: AtomDevTools['Service']) =>
  service.catalog.pipe(Stream.runHead, Effect.map(Option.getOrElse(() => [])));

const encodeCatalog = (catalog: readonly AtomSummary[]) =>
  Effect.all(catalog.map((summary) => AtomSummary.encodeEffect(summary))).pipe(Effect.orDie);

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
  return yield* AtomSnapshot.encodeEffect(value).pipe(Effect.orDie);
});

export const makeAtomDevToolsRpcHandlers = (service: AtomDevTools['Service']) =>
  AtomDevToolsRpc.of({
    GetCatalog: () => currentCatalog(service).pipe(Effect.flatMap(encodeCatalog)),
    Catalog: () => service.catalog.pipe(Stream.mapEffect((catalog) => encodeCatalog(catalog))),
    ListAtoms: Effect.fn('AtomDevToolsRpc.ListAtoms')(function* (payload) {
      const catalog = yield* currentCatalog(service).pipe(Effect.flatMap(encodeCatalog));
      const query = payload.query?.trim().toLocaleLowerCase();
      const filtered = catalog
        .filter(
          (atom) =>
            (query === void 0 ||
              atom.name.toLocaleLowerCase().includes(query) ||
              atom.id.toLocaleLowerCase().includes(query)) &&
            (payload.writable === void 0 || atom.writable === payload.writable) &&
            (payload.overridden === void 0 || atom.overridden === payload.overridden)
        )
        .toSorted((left, right) =>
          left.name === right.name
            ? left.id.localeCompare(right.id)
            : left.name.localeCompare(right.name)
        );
      const offset = payload.cursor ?? 0;
      const items = filtered.slice(offset, offset + payload.limit);
      const nextOffset = offset + items.length;
      return {
        items,
        total: filtered.length,
        ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
      };
    }),
    GetAtom: ({ atomId }) => getSnapshot(service, atomId),
    WatchAtom: ({ atomId }) =>
      service
        .watch(AtomId.make(atomId))
        .pipe(
          Stream.mapEffect((snapshot) => AtomSnapshot.encodeEffect(snapshot).pipe(Effect.orDie))
        ),
    ActivateState: ({ atomId, stateId }) =>
      service
        .execute(
          new ActivateState({
            atomId: AtomId.make(atomId),
            stateId,
          })
        )
        .pipe(Effect.as({})),
    ClearState: ({ atomId }) =>
      service.execute(new ClearState({ atomId: AtomId.make(atomId) })).pipe(Effect.as({})),
    ClearAllStates: () => service.execute(new ClearAllStates()).pipe(Effect.as({})),
    RefreshAtom: ({ atomId }) =>
      service.execute(new Refresh({ atomId: AtomId.make(atomId) })).pipe(Effect.as({})),
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
          supportsAck: false,
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
