import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import {
  EFFECT_RPC_REQUEST_MESSAGE,
  EFFECT_RPC_RESPONSE_MESSAGE,
} from '#src/shared/rpc-messages.ts';
import type { EffectRpcEventMap } from '#src/shared/rpc-messages.ts';

const ROZENITE_CLIENT_ID = 0;

export const makeRozeniteRpcServerProtocol = (client: RozeniteDevToolsClient<EffectRpcEventMap>) =>
  RpcServer.Protocol.make(
    Effect.fnUntraced(function* (writeRequest) {
      const disconnects = yield* Queue.unbounded<number>();
      const requests = yield* Queue.unbounded<RpcMessage.FromClientEncoded>();
      const clientIds = new Set([ROZENITE_CLIENT_ID]);

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.onMessage(EFFECT_RPC_REQUEST_MESSAGE, (request) => {
            Queue.offerUnsafe(requests, request);
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
      yield* Queue.take(requests).pipe(
        Effect.flatMap((request) => writeRequest(ROZENITE_CLIENT_ID, request)),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        disconnects,
        send: (_clientId, response) =>
          Effect.sync(() => {
            client.send(EFFECT_RPC_RESPONSE_MESSAGE, response);
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
