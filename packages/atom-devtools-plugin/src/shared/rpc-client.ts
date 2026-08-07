import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue, Stream } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';

import type { AtomDevToolsRpcEventMap } from '@repo/atom-devtools-core';

type Client = RozeniteDevToolsClient<AtomDevToolsRpcEventMap>;

export const makeAtomDevToolsRpcClientProtocol = Effect.fn('AtomDevToolsRpcClient.makeProtocol')(
  function* (client: Client) {
    return yield* RpcClient.Protocol.make((writeResponse, clientIds) =>
      Effect.gen(function* () {
        const responses = yield* Queue.unbounded<AtomDevToolsRpcEventMap['rpc-response']>();
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            client.onMessage('rpc-response', (response) => {
              Queue.offerUnsafe(responses, response);
            })
          ),
          (activeSubscription) =>
            Effect.sync(() => {
              activeSubscription.remove();
            })
        );
        yield* Stream.fromQueue(responses).pipe(
          Stream.runForEach((response) =>
            Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
              discard: true,
            })
          ),
          Effect.forkScoped
        );

        return {
          send: (_clientId, request) =>
            Effect.sync(() => {
              client.send('rpc-request', request);
            }),
          supportsAck: true,
          supportsTransferables: false,
        };
      })
    );
  }
);
