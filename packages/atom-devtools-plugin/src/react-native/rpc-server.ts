import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Queue, Stream } from 'effect';

import type {
  AtomDevToolsRpcEventMap,
  AtomDevToolsRpcServerTransport,
} from '@repo/atom-devtools-core';

type Client = RozeniteDevToolsClient<AtomDevToolsRpcEventMap>;

export const makeRozeniteRpcServerTransport = (client: Client): AtomDevToolsRpcServerTransport => ({
  run: (handler) =>
    Effect.gen(function* () {
      const requests = yield* Queue.unbounded<AtomDevToolsRpcEventMap['rpc-request']>();
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.onMessage('rpc-request', (request) => {
            Queue.offerUnsafe(requests, request);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      );
      return yield* Stream.fromQueue(requests).pipe(
        Stream.runForEach(handler),
        Effect.andThen(Effect.never)
      );
    }),
  send: (response) =>
    Effect.sync(() => {
      client.send('rpc-response', response);
    }),
});
