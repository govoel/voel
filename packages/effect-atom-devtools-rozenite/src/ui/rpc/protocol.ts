import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue, Random } from 'effect';
import { RpcClient, RpcClientError } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import {
  RPC_CLIENT_EVENT,
  RPC_RESPONSE_EVENT,
  RpcBridgeClientMessage,
} from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

export const makeRpcClientProtocol = (bridgeClient: RozeniteDevToolsClient<RpcBridgeEventMap>) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const activeSessionId = `${yield* Random.nextInt}:${yield* Random.nextInt}`;
      const incomingResponses = yield* Queue.unbounded<RpcMessage.FromServerEncoded>();

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          bridgeClient.onMessage(RPC_RESPONSE_EVENT, (response) => {
            if (response.sessionId === activeSessionId) {
              Queue.offerUnsafe(incomingResponses, response.message);
            }
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          bridgeClient.send(
            RPC_CLIENT_EVENT,
            RpcBridgeClientMessage.Start({ sessionId: activeSessionId })
          );
        }),
        () =>
          Effect.sync(() => {
            bridgeClient.send(
              RPC_CLIENT_EVENT,
              RpcBridgeClientMessage.End({ sessionId: activeSessionId })
            );
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
              bridgeClient.send(
                RPC_CLIENT_EVENT,
                RpcBridgeClientMessage.Request({
                  sessionId: activeSessionId,
                  message: request,
                })
              );
            },
            catch: (cause: unknown) =>
              new RpcClientError.RpcClientError({
                reason: new RpcClientError.RpcClientDefect({
                  message: 'Failed to send an RPC message through the Rozenite bridge',
                  cause,
                }),
              }),
          }),
        supportsAck: true,
        supportsTransferables: false,
      };
    })
  );
