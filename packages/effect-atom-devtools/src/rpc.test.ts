import { describe, expect, it } from '@effect/vitest';
import { Effect, Option, Queue, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';
import { RpcClient } from 'effect/unstable/rpc';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';

import { AtomDevTools } from '#src/atom-dev-tools.ts';
import { serveAtomDevToolsRpc } from '#src/rpc-server.ts';
import { AtomDevToolsRpc } from '#src/rpc.ts';

describe('AtomDevToolsRpcServer', () => {
  it.effect('serves unary, streaming, and mutation RPCs', () =>
    Effect.gen(function* () {
      const requests = yield* Queue.unbounded<FromClientEncoded>();
      const responses = yield* Queue.unbounded<FromServerEncoded>();

      yield* serveAtomDevToolsRpc({
        run: (handler) =>
          Stream.fromQueue(requests).pipe(Stream.runForEach(handler), Effect.andThen(Effect.never)),
        send: (message) => Queue.offer(responses, message),
      }).pipe(Effect.forkScoped);

      const protocol = yield* RpcClient.Protocol.make((writeResponse, clientIds) =>
        Effect.gen(function* () {
          yield* Stream.fromQueue(responses).pipe(
            Stream.runForEach((response) =>
              Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
                discard: true,
              })
            ),
            Effect.forkScoped
          );
          return {
            send: (_clientId, request) => Queue.offer(requests, request),
            supportsAck: true,
            supportsTransferables: false,
          };
        })
      );
      // Ensure responses are routed without assuming that the active RPC client has ID 0.
      yield* RpcClient.make(AtomDevToolsRpc, {
        disableTracing: true,
      }).pipe(Effect.provideService(RpcClient.Protocol, protocol));
      const client = yield* RpcClient.make(AtomDevToolsRpc, {
        disableTracing: true,
      }).pipe(Effect.provideService(RpcClient.Protocol, protocol));

      const streamed = yield* client.Catalog().pipe(Stream.runHead);
      const catalog = Option.getOrThrow(streamed);
      expect(catalog.map(({ name }) => name)).toEqual(['Count']);

      const atomId = Option.getOrThrow(Option.fromNullishOr(catalog[0])).id;
      const atom = yield* client.GetAtom({ atomId });
      expect(atom.value).toBe('1');

      yield* client.RefreshAtom({ atomId: atom.id });
    }).pipe(
      Effect.provide(AtomDevTools.layer),
      Effect.provideService(
        AtomRegistry.AtomRegistry,
        (() => {
          const registry = AtomRegistry.make();
          registry.get(Atom.make(1).pipe(Atom.withLabel('Count'), Atom.keepAlive));
          return registry;
        })()
      ),
      Effect.scoped
    )
  );
});
