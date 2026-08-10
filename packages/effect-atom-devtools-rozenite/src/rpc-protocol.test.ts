import { describe, expect, it } from '@effect/vitest';
import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Deferred, Effect, Option, Queue, Random, Ref, Schema, Stream } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcMessage, RpcSchema, RpcServer } from 'effect/unstable/rpc';

import { makeRpcServerProtocol } from '#src/react-native/rpc/protocol.ts';
import {
  RPC_CLIENT_EVENT,
  RPC_RESPONSE_EVENT,
  RpcBridgeClientMessage,
} from '#src/shared/rpc-bridge.ts';
import type { RpcBridgeEventMap } from '#src/shared/rpc-bridge.ts';
import { makeRpcClientProtocol } from '#src/ui/rpc/protocol.ts';

interface BridgeEvent {
  readonly type: keyof RpcBridgeEventMap;
  readonly payload: unknown;
}

type BridgeListeners = {
  readonly [Event in keyof RpcBridgeEventMap]: Set<(payload: RpcBridgeEventMap[Event]) => void>;
};

const makeBridgeClient = (loopback = false) => {
  const listeners: BridgeListeners = {
    [RPC_CLIENT_EVENT]: new Set(),
    [RPC_RESPONSE_EVENT]: new Set(),
  };
  const sent: BridgeEvent[] = [];

  const client: RozeniteDevToolsClient<RpcBridgeEventMap> = {
    send: (type, payload) => {
      sent.push({ type, payload });
      if (loopback) {
        for (const listener of listeners[type]) {
          listener(payload);
        }
      }
    },
    onMessage: (type, listener) => {
      const eventListeners = listeners[type];
      eventListeners.add(listener);

      return {
        remove: () => {
          eventListeners.delete(listener);
        },
      };
    },
    close: () => {
      for (const eventListeners of Object.values(listeners)) {
        eventListeners.clear();
      }
    },
  };

  const emit = <Event extends keyof RpcBridgeEventMap>(
    type: Event,
    payload: RpcBridgeEventMap[Event]
  ): void => {
    for (const listener of listeners[type]) {
      listener(payload);
    }
  };

  return { client, emit, sent } as const;
};

const ping = { _tag: 'Ping' } as const satisfies RpcMessage.FromClientEncoded;
const pong = { _tag: 'Pong' } as const satisfies RpcMessage.FromServerEncoded;
const fixedRandom = (nextInt: number) => ({
  nextIntUnsafe: () => nextInt,
  nextDoubleUnsafe: () => 0,
});

describe('Rozenite RPC server protocol sessions', () => {
  it.effect('disconnects the previous session and routes requests under a fresh client id', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bridge = makeBridgeClient();
        const protocol = yield* makeRpcServerProtocol(bridge.client);
        const requests = yield* Queue.unbounded<{
          readonly clientId: number;
          readonly message: RpcMessage.FromClientEncoded;
        }>();

        yield* protocol
          .run((clientId, message) => Queue.offer(requests, { clientId, message }))
          .pipe(Effect.forkScoped);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.Start({ sessionId: 'session-a' }));
        bridge.emit(
          RPC_CLIENT_EVENT,
          RpcBridgeClientMessage.Request({ sessionId: 'session-a', message: ping })
        );

        expect(yield* Queue.take(requests)).toEqual({ clientId: 0, message: ping });
        expect([...(yield* protocol.clientIds)]).toEqual([0]);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.Start({ sessionId: 'session-a' }));
        bridge.emit(
          RPC_CLIENT_EVENT,
          RpcBridgeClientMessage.Request({ sessionId: 'session-a', message: ping })
        );

        expect(yield* Queue.take(requests)).toEqual({ clientId: 0, message: ping });
        expect(yield* Queue.size(protocol.disconnects)).toBe(0);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.Start({ sessionId: 'session-b' }));

        expect(yield* Queue.take(protocol.disconnects)).toBe(0);
        expect([...(yield* protocol.clientIds)]).toEqual([1]);

        bridge.emit(
          RPC_CLIENT_EVENT,
          RpcBridgeClientMessage.Request({ sessionId: 'session-a', message: ping })
        );
        bridge.emit(
          RPC_CLIENT_EVENT,
          RpcBridgeClientMessage.Request({ sessionId: 'session-b', message: ping })
        );

        expect(yield* Queue.take(requests)).toEqual({ clientId: 1, message: ping });
        yield* Effect.yieldNow;
        expect(yield* Queue.size(requests)).toBe(0);
      })
    )
  );

  it.effect('drops stale responses and disconnects only the active session', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bridge = makeBridgeClient();
        const protocol = yield* makeRpcServerProtocol(bridge.client);
        const requestClientIds = yield* Queue.unbounded<number>();

        yield* protocol
          .run((clientId) => Queue.offer(requestClientIds, clientId))
          .pipe(Effect.forkScoped);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.Start({ sessionId: 'session-a' }));
        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.Start({ sessionId: 'session-b' }));
        expect(yield* Queue.take(protocol.disconnects)).toBe(0);

        yield* protocol.send(0, pong);
        yield* protocol.send(1, pong);

        expect(bridge.sent).toEqual([
          {
            type: RPC_RESPONSE_EVENT,
            payload: { sessionId: 'session-b', message: pong },
          },
        ]);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.End({ sessionId: 'session-a' }));
        yield* Effect.yieldNow;
        expect([...(yield* protocol.clientIds)]).toEqual([1]);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.End({ sessionId: 'session-b' }));
        expect(yield* Queue.take(protocol.disconnects)).toBe(1);
        expect([...(yield* protocol.clientIds)]).toEqual([]);

        bridge.emit(RPC_CLIENT_EVENT, RpcBridgeClientMessage.Start({ sessionId: 'session-c' }));
        bridge.emit(
          RPC_CLIENT_EVENT,
          RpcBridgeClientMessage.Request({ sessionId: 'session-c', message: ping })
        );
        expect(yield* Queue.take(requestClientIds)).toBe(2);

        yield* protocol.end(2);
        yield* protocol.send(2, pong);
        expect([...(yield* protocol.clientIds)]).toEqual([]);
        expect(bridge.sent).toHaveLength(1);
      })
    )
  );
});

describe('Rozenite RPC client protocol sessions', () => {
  it.effect('tags requests and accepts responses only for its session', () =>
    Effect.gen(function* () {
      const bridge = makeBridgeClient();
      const responses = yield* Queue.unbounded<RpcMessage.FromServerEncoded>();

      yield* Effect.scoped(
        Effect.gen(function* () {
          const protocol = yield* makeRpcClientProtocol(bridge.client).pipe(
            Effect.provideService(Random.Random, fixedRandom(1))
          );
          yield* protocol
            .run(0, (response) => Queue.offer(responses, response))
            .pipe(Effect.forkScoped);

          yield* protocol.send(0, ping);

          bridge.emit(RPC_RESPONSE_EVENT, { sessionId: 'stale-session', message: pong });
          yield* Effect.yieldNow;
          expect(yield* Queue.size(responses)).toBe(0);

          bridge.emit(RPC_RESPONSE_EVENT, { sessionId: '1:1', message: pong });
          expect(yield* Queue.take(responses)).toEqual(pong);
        })
      );

      expect(bridge.sent).toEqual([
        {
          type: RPC_CLIENT_EVENT,
          payload: { _tag: 'Start', sessionId: '1:1' },
        },
        {
          type: RPC_CLIENT_EVENT,
          payload: { _tag: 'Request', sessionId: '1:1', message: ping },
        },
        {
          type: RPC_CLIENT_EVENT,
          payload: { _tag: 'End', sessionId: '1:1' },
        },
      ]);
    })
  );
});

const ReloadTestRpc = RpcGroup.make(
  Rpc.make('Events', {
    success: RpcSchema.Stream(Schema.String, Schema.Never),
  })
);

describe('Rozenite RPC session reload integration', () => {
  it.effect('serves the same request id after replacing a client with a live stream', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bridge = makeBridgeClient(true);
        const serverProtocol = yield* makeRpcServerProtocol(bridge.client);
        const handlerCount = yield* Ref.make(0);
        const firstHandlerFinalized = yield* Deferred.make<boolean>();

        const handlers = ReloadTestRpc.toLayer({
          Events: () =>
            Stream.unwrap(
              Ref.updateAndGet(handlerCount, (count) => count + 1).pipe(
                Effect.map((handlerId) =>
                  Stream.make(`event-${handlerId}`).pipe(
                    Stream.concat(Stream.never),
                    Stream.ensuring(
                      handlerId === 1 ? Deferred.succeed(firstHandlerFinalized, true) : Effect.void
                    )
                  )
                )
              )
            ),
        });

        yield* RpcServer.make(ReloadTestRpc).pipe(
          Effect.provideService(RpcServer.Protocol, serverProtocol),
          Effect.provide(handlers),
          Effect.forkScoped
        );

        const firstProtocol = yield* makeRpcClientProtocol(bridge.client).pipe(
          Effect.provideService(Random.Random, fixedRandom(1))
        );
        const firstClient = yield* RpcClient.make(ReloadTestRpc, {
          generateRequestId: () => RpcMessage.RequestId('0'),
        }).pipe(Effect.provideService(RpcClient.Protocol, firstProtocol));
        const firstValues = yield* Queue.unbounded<string>();

        yield* firstClient.Events().pipe(
          Stream.runForEach((value) => Queue.offer(firstValues, value)),
          Effect.forkScoped
        );

        expect(yield* Queue.take(firstValues)).toBe('event-1');

        const secondProtocol = yield* makeRpcClientProtocol(bridge.client).pipe(
          Effect.provideService(Random.Random, fixedRandom(2))
        );
        const secondClient = yield* RpcClient.make(ReloadTestRpc, {
          generateRequestId: () => RpcMessage.RequestId('0'),
        }).pipe(Effect.provideService(RpcClient.Protocol, secondProtocol));

        expect(
          yield* secondClient
            .Events()
            .pipe(Stream.runHead, Effect.map(Option.getOrThrow), Effect.timeout('1 second'))
        ).toBe('event-2');
        yield* Deferred.await(firstHandlerFinalized).pipe(Effect.timeout('1 second'));
        expect(yield* Ref.get(handlerCount)).toBe(2);
      })
    )
  );
});
