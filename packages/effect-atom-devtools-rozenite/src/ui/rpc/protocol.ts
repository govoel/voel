import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Match, Option, Queue, Random, Schema } from 'effect';
import { RpcClient, RpcClientError } from 'effect/rpc';
import type { RpcMessage } from 'effect/rpc';

import {
  RPC_CLIENT_EVENT,
  RPC_SERVER_EVENT,
  RpcBridgeClientMessage,
  RpcBridgeServerMessage,
} from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

export const makeRpcClientProtocol = (bridgeClient: RozeniteDevToolsClient<RpcBridgeEventMap>) => {
  const sendClientMessage = (message: RpcBridgeClientMessage): void => {
    bridgeClient.send(RPC_CLIENT_EVENT, message);
  };

  return RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const clientSessionId = `${yield* Random.nextInt}:${yield* Random.nextInt}`;
      const incomingMessages = yield* Queue.unbounded<RpcBridgeServerMessage>();
      const activeRequests = new Map<string | number, RpcMessage.RequestEncoded>();
      let activeSessionId = clientSessionId;
      let activeServerId = Option.none<string>();

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

          Match.value(message).pipe(
            Match.tag('Exit', ({ requestId }) => {
              activeRequests.delete(requestId);
            }),
            Match.tag('Defect', 'ClientProtocolError', () => {
              activeRequests.clear();
            }),
            Match.tag('Chunk', 'Pong', 'Request', () => void 0),
            Match.exhaustive
          );

          yield* broadcastResponse(message);
        }),
      });

      yield* Queue.take(incomingMessages).pipe(
        Effect.flatMap(handleIncomingMessage),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        send: (_clientId, request) =>
          Effect.try({
            try: () => {
              Match.value(request).pipe(
                Match.tag('Request', (message) => {
                  activeRequests.set(message.id, message);
                }),
                Match.tag('Interrupt', ({ requestId }) => {
                  activeRequests.delete(requestId);
                }),
                Match.tag('Eof', () => {
                  activeRequests.clear();
                }),
                Match.tag('Ack', 'Ping', () => void 0),
                Match.exhaustive
              );

              sendClientMessage(
                RpcBridgeClientMessage.Request({
                  sessionId: activeSessionId,
                  message: request,
                })
              );
            },
            catch: (cause: unknown) => {
              Match.value(request).pipe(
                Match.tag('Request', ({ id }) => {
                  activeRequests.delete(id);
                }),
                Match.tag('Interrupt', 'Eof', 'Ack', 'Ping', () => void 0),
                Match.exhaustive
              );

              return RpcClientError.RpcClientError.make({
                reason: RpcClientError.RpcClientDefect.make({
                  message: 'Failed to send an RPC message through the Rozenite bridge',
                  cause,
                }),
              });
            },
          }),
        supportsAck: true,
        supportsTransferables: false,
        codecFor: Schema.toCodecJson,
      };
    })
  );
};
