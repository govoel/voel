import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue } from 'effect';
import { RpcClient, RpcClientError } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import { RPC_REQUEST_EVENT, RPC_RESPONSE_EVENT } from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

const makeRpcSendError = (cause: unknown) =>
  new RpcClientError.RpcClientError({
    reason: new RpcClientError.RpcClientDefect({
      message: 'Failed to send an RPC message through the Rozenite bridge',
      cause,
    }),
  });

export const makeRpcClientProtocol = (bridgeClient: RozeniteDevToolsClient<RpcBridgeEventMap>) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const incomingResponses = yield* Queue.unbounded<RpcMessage.FromServerEncoded>();

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          bridgeClient.onMessage(RPC_RESPONSE_EVENT, (response) => {
            Queue.offerUnsafe(incomingResponses, response);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );

      const broadcastResponse = (response: RpcMessage.FromServerEncoded) =>
        Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
          concurrency: 'unbounded',
          discard: true,
        });

      // Each protocol instance backs exactly one AtomDevToolsRpcClient, so every transport
      // response belongs to its sole active RPC client. Avoid maintaining the general
      // request-to-client routing map used by multiplexed protocols.
      yield* Queue.take(incomingResponses).pipe(
        Effect.flatMap(broadcastResponse),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        send: (_clientId, request) =>
          Effect.try({
            try: () => {
              bridgeClient.send(RPC_REQUEST_EVENT, request);
            },
            catch: makeRpcSendError,
          }),
        supportsAck: true,
        supportsTransferables: false,
      };
    })
  );
