import { describe, expect, it } from '@effect/vitest';
import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Fiber, Latch, Layer, Option, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';
import { RpcClient } from 'effect/unstable/rpc';

import { AtomDevToolsRpc } from '@repo/effect-atom-devtools-core/rpc';
import { AtomDevToolsRpcServer } from '@repo/effect-atom-devtools-core/rpc-server';

import { makeRozeniteRpcClientProtocol } from '#src/rpc/client-protocol.ts';
import type { EffectRpcEventMap } from '#src/rpc/messages.ts';
import { layerRozeniteRpcServerProtocol } from '#src/rpc/server-protocol.ts';

type MessageListener = (payload: unknown) => void;
type MessageListeners = Map<keyof EffectRpcEventMap, Set<MessageListener>>;

const makeClient = (
  listeners: MessageListeners,
  peerListeners: MessageListeners
): RozeniteDevToolsClient<EffectRpcEventMap> => ({
  send: (type, payload) => {
    for (const listener of peerListeners.get(type) ?? []) {
      listener(payload);
    }
  },
  onMessage: (type, listener) => {
    const typeListeners = listeners.get(type) ?? new Set<MessageListener>();
    // The listener is stored behind its message type and only receives payloads sent with that type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const messageListener = listener as MessageListener;
    typeListeners.add(messageListener);
    listeners.set(type, typeListeners);

    return {
      remove: () => {
        typeListeners.delete(messageListener);
      },
    };
  },
  close: () => void 0,
});

const makeClientPair = () => {
  const deviceListeners: MessageListeners = new Map();
  const panelListeners: MessageListeners = new Map();

  return {
    device: makeClient(deviceListeners, panelListeners),
    panel: makeClient(panelListeners, deviceListeners),
  };
};

describe('Rozenite Effect RPC protocol', () => {
  it.effect('carries streaming AtomDevTools RPCs in both directions', () => {
    const registry = AtomRegistry.make();
    const atom = Atom.make(0).pipe(Atom.withLabel('Count'), Atom.keepAlive);
    registry.get(atom);
    const { device, panel } = makeClientPair();
    const protocolLayer = layerRozeniteRpcServerProtocol(device);
    const serverLayer = AtomDevToolsRpcServer.pipe(
      Layer.provide(protocolLayer),
      Layer.provide(Layer.succeed(AtomRegistry.AtomRegistry, registry))
    );

    return Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(serverLayer);

        const protocol = yield* makeRozeniteRpcClientProtocol(panel);
        const client = yield* RpcClient.make(AtomDevToolsRpc).pipe(
          Effect.provideService(RpcClient.Protocol, protocol)
        );
        const catalog = yield* client.catalog().pipe(Stream.runHead, Effect.map(Option.getOrThrow));
        const summary = Option.getOrThrow(Option.fromNullishOr(catalog[0]));
        expect(summary.name).toBe('Count');

        const initialObserved = yield* Latch.make();
        const snapshotsFiber = yield* client.watch({ id: summary.id }).pipe(
          Stream.tap(() => initialObserved.open),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild
        );

        yield* initialObserved.await;
        registry.set(atom, 1);

        const snapshots = yield* Fiber.join(snapshotsFiber);
        expect(snapshots.map(({ value }) => value)).toEqual(['0', '1']);
      })
    );
  });
});
