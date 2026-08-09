import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import { RPC_REQUEST_EVENT, RPC_RESPONSE_EVENT } from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';

const BRIDGE_CLIENT_ID = 0;

export const makeRpcServerProtocol = (bridgeClient: RozeniteDevToolsClient<RpcBridgeEventMap>) =>
  RpcServer.Protocol.make(
    Effect.fnUntraced(function* (writeRequest) {
      const disconnects = yield* Queue.unbounded<number>();
      const incomingRequests = yield* Queue.unbounded<RpcMessage.FromClientEncoded>();
      const clientIds = new Set([BRIDGE_CLIENT_ID]);

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          bridgeClient.onMessage(RPC_REQUEST_EVENT, (request) => {
            Queue.offerUnsafe(incomingRequests, request);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );

      // Keep transport envelopes ordered through `writeRequest`. It decodes a Request,
      // records its schema, and registers the handler fiber before returning; Effect RPC
      // then runs the handler concurrently in the background. Processing this queue with
      // unbounded concurrency could let a following Ack, Interrupt, or Eof overtake that
      // registration and observe incomplete request state.
      yield* Queue.take(incomingRequests).pipe(
        Effect.flatMap((request) => writeRequest(BRIDGE_CLIENT_ID, request)),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        disconnects,
        send: (_clientId, response) =>
          Effect.sync(() => {
            bridgeClient.send(RPC_RESPONSE_EVENT, response);
          }),
        end: () => Effect.void,
        clientIds: Effect.succeed(clientIds),
        initialMessage: Effect.succeedNone,
        supportsAck: true,
        supportsTransferables: false,
        supportsSpanPropagation: false,
      };
    })
  );
