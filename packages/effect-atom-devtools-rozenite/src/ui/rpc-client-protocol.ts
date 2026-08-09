import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue } from 'effect';
import { RpcClient, RpcClientError } from 'effect/unstable/rpc';
import type { RpcMessage } from 'effect/unstable/rpc';

import {
  EFFECT_RPC_REQUEST_MESSAGE,
  EFFECT_RPC_RESPONSE_MESSAGE,
} from '#src/shared/rpc-messages.ts';
import type { EffectRpcEventMap } from '#src/shared/rpc-messages.ts';

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

      // Each protocol instance backs exactly one AtomDevToolsClient, so every transport
      // response belongs to its sole active RPC client. Avoid maintaining the general
      // request-to-client routing map used by multiplexed protocols.
      yield* Queue.take(responses).pipe(
        Effect.flatMap(broadcast),
        Effect.forever,
        Effect.forkScoped
      );

      return {
        send: (_clientId, request) =>
          Effect.try({
            try: () => {
              client.send(EFFECT_RPC_REQUEST_MESSAGE, request);
            },
            catch: makeSendError,
          }),
        supportsAck: true,
        supportsTransferables: false,
      };
    })
  );
