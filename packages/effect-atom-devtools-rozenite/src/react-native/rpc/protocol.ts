import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Match, Option, Queue } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import { RPC_CLIENT_EVENT, RPC_RESPONSE_EVENT } from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeClientMessage, RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

export const makeRpcServerProtocol = (bridgeClient: RozeniteDevToolsClient<RpcBridgeEventMap>) =>
  RpcServer.Protocol.make(
    Effect.fnUntraced(function* (writeRequest) {
      const disconnects = yield* Queue.unbounded<number>();
      const incomingMessages = yield* Queue.unbounded<RpcBridgeClientMessage>();
      const clientIds = new Set<number>();
      let activeSession = Option.none<{
        readonly sessionId: string;
        readonly clientId: number;
      }>();
      let nextClientId = 0;

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          bridgeClient.onMessage(RPC_CLIENT_EVENT, (message) => {
            Queue.offerUnsafe(incomingMessages, message);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );

      const startSession = Effect.fnUntraced(function* (sessionId: string) {
        if (Option.exists(activeSession, (session) => session.sessionId === sessionId)) {
          return;
        }

        const previousSession = activeSession;
        const clientId = nextClientId;
        nextClientId += 1;
        activeSession = Option.some({ sessionId, clientId });
        clientIds.add(clientId);

        if (Option.isSome(previousSession)) {
          clientIds.delete(previousSession.value.clientId);
          yield* Queue.offer(disconnects, previousSession.value.clientId);
        }
      });

      const endSession = Effect.fnUntraced(function* (sessionId: string) {
        if (Option.isNone(activeSession) || activeSession.value.sessionId !== sessionId) {
          return;
        }

        const { clientId } = activeSession.value;
        activeSession = Option.none();
        clientIds.delete(clientId);
        yield* Queue.offer(disconnects, clientId);
      });

      const handleRequest = Effect.fnUntraced(function* (
        sessionId: string,
        message: RpcMessage.FromClientEncoded
      ) {
        if (Option.isNone(activeSession) || activeSession.value.sessionId !== sessionId) {
          return;
        }

        yield* writeRequest(activeSession.value.clientId, message);
      });

      const handleIncomingMessage = Effect.fnUntraced(function* (
        clientMessage: RpcBridgeClientMessage
      ) {
        return yield* Match.value(clientMessage).pipe(
          Match.tagsExhaustive({
            Start: ({ sessionId }) => startSession(sessionId),
            End: ({ sessionId }) => endSession(sessionId),
            Request: ({ sessionId, message }) => handleRequest(sessionId, message),
          })
        );
      });

      // Keep session changes and transport envelopes ordered through `writeRequest`.
      // It decodes a Request, records its schema, and registers the handler fiber before
      // returning; Effect RPC then runs the handler concurrently in the background.
      // Processing this queue with unbounded concurrency could let a following Ack,
      // Interrupt, Eof, or session change observe incomplete request state.
      yield* Queue.take(incomingMessages).pipe(
        Effect.flatMap(handleIncomingMessage),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        disconnects,
        send: (clientId, response) =>
          Effect.sync(() => {
            if (Option.isSome(activeSession) && activeSession.value.clientId === clientId) {
              bridgeClient.send(RPC_RESPONSE_EVENT, {
                sessionId: activeSession.value.sessionId,
                message: response,
              });
            }
          }),
        end: (clientId) =>
          Effect.sync(() => {
            if (Option.exists(activeSession, (session) => session.clientId === clientId)) {
              activeSession = Option.none();
            }
            clientIds.delete(clientId);
          }),
        clientIds: Effect.sync(() => clientIds),
        initialMessage: Effect.succeedNone,
        supportsAck: true,
        supportsTransferables: false,
        supportsSpanPropagation: false,
      };
    })
  );
