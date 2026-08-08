import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue } from 'effect';
import { RpcClient, RpcClientError } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import { EFFECT_RPC_REQUEST_MESSAGE, EFFECT_RPC_RESPONSE_MESSAGE } from '#src/rpc/messages.ts';
import type { EffectRpcEventMap } from '#src/rpc/messages.ts';

const makeSendError = (cause: unknown) =>
  new RpcClientError.RpcClientError({
    reason: new RpcClientError.RpcClientDefect({
      message: 'Failed to send an RPC message through the Rozenite bridge',
      cause,
    }),
  });

export const makeRozeniteRpcClientProtocol = (client: RozeniteDevToolsClient<EffectRpcEventMap>) =>
  RpcClient.Protocol.make(
    Effect.fn('makeRozeniteRpcClientProtocol')(function* (writeResponse, clientIds) {
      const responses = yield* Queue.unbounded<RpcMessage.FromServerEncoded>();
      const requestClientIds = new Map<string | number, number>();

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.onMessage(EFFECT_RPC_RESPONSE_MESSAGE, (response) => {
            Queue.offerUnsafe(responses, response);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );

      const broadcast = (response: RpcMessage.FromServerEncoded) =>
        Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
          discard: true,
        });

      yield* Queue.take(responses).pipe(
        Effect.flatMap((response) => {
          if ('requestId' in response) {
            const clientId = requestClientIds.get(response.requestId);
            if (clientId !== void 0) {
              if (response._tag === 'Exit') {
                requestClientIds.delete(response.requestId);
              }
              return writeResponse(clientId, response);
            }
          }
          return broadcast(response);
        }),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        send: Effect.fn('RozeniteRpcClientProtocol.send')(
          function* (clientId, request): Effect.fn.Return<void, RpcClientError.RpcClientError> {
            yield* Effect.try({
              try: () => {
                client.send(EFFECT_RPC_REQUEST_MESSAGE, request);
              },
              catch: makeSendError,
            });

            if (request._tag === 'Request') {
              requestClientIds.set(request.id, clientId);
            }
          }
        ),
        supportsAck: true,
        supportsTransferables: false,
      };
    })
  );
