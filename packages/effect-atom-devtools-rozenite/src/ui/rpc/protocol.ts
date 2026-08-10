import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Option, Queue, Random } from 'effect';
import { RpcClient, RpcClientError } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import {
  RPC_CLIENT_EVENT,
  RPC_SERVER_EVENT,
  RpcBridgeClientMessage,
  RpcBridgeServerMessage,
} from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

export const makeRpcClientProtocol = (bridgeClient: RozeniteDevToolsClient<RpcBridgeEventMap>) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const clientSessionId = `${yield* Random.nextInt}:${yield* Random.nextInt}`;
      const incomingMessages = yield* Queue.unbounded<RpcBridgeServerMessage>();
      const activeRequests = new Map<string | number, RpcMessage.RequestEncoded>();
      let activeSessionId = clientSessionId;
      let activeServerId = Option.none<string>();

      const sendClientMessage = (message: RpcBridgeClientMessage): void => {
        bridgeClient.send(RPC_CLIENT_EVENT, message);
      };

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          bridgeClient.onMessage(RPC_SERVER_EVENT, (message) => {
            Queue.offerUnsafe(incomingMessages, message);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );

      const sendSessionStart = (): void => {
        sendClientMessage(RpcBridgeClientMessage.Start({ sessionId: activeSessionId }));
      };

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          sendSessionStart();
        }),
        () =>
          Effect.sync(() => {
            sendClientMessage(RpcBridgeClientMessage.End({ sessionId: activeSessionId }));
          })
      );

      const broadcastResponse = (response: RpcMessage.FromServerEncoded) =>
        Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
          concurrency: 'unbounded',
          discard: true,
        });

      const handleIncomingMessage = RpcBridgeServerMessage.$match({
        Ready: Effect.fnUntraced(function* ({ serverId }) {
          if (Option.exists(activeServerId, (activeId) => activeId === serverId)) {
            return;
          }

          activeServerId = Option.some(serverId);
          activeSessionId = `${clientSessionId}:${serverId}`;

          yield* Effect.sync(() => {
            sendSessionStart();
            for (const request of activeRequests.values()) {
              sendClientMessage(
                RpcBridgeClientMessage.Request({ sessionId: activeSessionId, message: request })
              );
            }
          });
        }),
        Response: Effect.fnUntraced(function* ({ message, sessionId }) {
          if (sessionId !== activeSessionId) {
            return;
          }

          if (message._tag === 'Exit') {
            activeRequests.delete(message.requestId);
          } else if (message._tag === 'Defect' || message._tag === 'ClientProtocolError') {
            activeRequests.clear();
          }

          yield* broadcastResponse(message);
        }),
      });

      // Each protocol instance backs exactly one AtomDevToolsRpcClient, so every transport
      // response belongs to its sole active RPC client. Avoid maintaining the general
      // request-to-client routing map used by multiplexed protocols.
      yield* Queue.take(incomingMessages).pipe(
        Effect.flatMap(handleIncomingMessage),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        send: (_clientId, request) =>
          Effect.try({
            try: () => {
              if (request._tag === 'Request') {
                activeRequests.set(request.id, request);
              } else if (request._tag === 'Interrupt') {
                activeRequests.delete(request.requestId);
              } else if (request._tag === 'Eof') {
                activeRequests.clear();
              }

              sendClientMessage(
                RpcBridgeClientMessage.Request({
                  sessionId: activeSessionId,
                  message: request,
                })
              );
            },
            catch: (cause: unknown) => {
              if (request._tag === 'Request') {
                activeRequests.delete(request.id);
              }

              return new RpcClientError.RpcClientError({
                reason: new RpcClientError.RpcClientDefect({
                  message: 'Failed to send an RPC message through the Rozenite bridge',
                  cause,
                }),
              });
            },
          }),
        supportsAck: true,
        supportsTransferables: false,
      };
    })
  );
