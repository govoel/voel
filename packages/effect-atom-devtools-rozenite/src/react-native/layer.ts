import type {
  AgentSessionReadyMessage,
  RegisterToolMessage,
  ToolCallMessage,
  ToolResultMessage,
  UnregisterToolMessage,
} from '@rozenite/agent-shared';
import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Array, Cause, Data, Effect, Layer, Match, Option, Queue, Stream } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';

import { AtomDevTools } from '@repo/effect-atom-devtools-core/atom-dev-tools';
import { AtomDevToolsRpcServerFromService } from '@repo/effect-atom-devtools-core/rpc-server';

import { atomDevToolsAgentTools } from '#src/react-native/agent/tools.ts';
import { makeRozeniteRpcServerProtocol } from '#src/react-native/rpc-server-protocol.ts';
import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';
import type { EffectRpcEventMap } from '#src/shared/rpc-messages.ts';

const AGENT_PLUGIN_ID = 'rozenite-agent';

// Rozenite's event-map constraint works with a closed type alias rather than an interface.
// oxlint-disable-next-line typescript/consistent-type-definitions
type AgentEventMap = {
  readonly 'agent-session-ready': AgentSessionReadyMessage['payload'];
  readonly 'register-tool': RegisterToolMessage['payload'];
  readonly 'tool-call': ToolCallMessage['payload'];
  readonly 'tool-result': ToolResultMessage['payload'];
  readonly 'unregister-tool': UnregisterToolMessage['payload'];
};

type IncomingAgentMessage = Data.TaggedEnum<{
  readonly SessionReady: Record<never, never>;
  readonly ToolCall: { readonly payload: ToolCallMessage['payload'] };
}>;

const IncomingAgentMessage = Data.taggedEnum<IncomingAgentMessage>();

const RozeniteRpcServerProtocolLive = Layer.effect(
  RpcServer.Protocol,
  Effect.gen(function* () {
    const rozeniteClient = yield* Effect.acquireRelease(
      Effect.promise(async () =>
        getRozeniteDevToolsClient<EffectRpcEventMap>(EFFECT_ATOM_DEVTOOLS_PLUGIN_ID)
      ),
      (client) =>
        Effect.sync(() => {
          client.close();
        })
    );

    return yield* makeRozeniteRpcServerProtocol(rozeniteClient);
  })
);

const AtomDevToolsRozeniteRpcLive = Layer.effectDiscard(
  Layer.build(
    AtomDevToolsRpcServerFromService.pipe(Layer.provide(RozeniteRpcServerProtocolLive))
  ).pipe(Effect.forkScoped)
);

const AtomDevToolsRozeniteAgentTools = Layer.effectDiscard(
  Effect.gen(function* () {
    const client = yield* Effect.acquireRelease(
      Effect.promise(async () => getRozeniteDevToolsClient<AgentEventMap>(AGENT_PLUGIN_ID)),
      (agentClient) =>
        Effect.sync(() => {
          agentClient.close();
        })
    );
    const messages = yield* Queue.unbounded<IncomingAgentMessage>();

    const register = Effect.fn('RozeniteAgentTools.register')(function* () {
      yield* Effect.sync(() => {
        client.send('register-tool', { tools: atomDevToolsAgentTools.map(({ tool }) => tool) });
      });
    });

    yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          [
            client.onMessage('agent-session-ready', () => {
              Queue.offerUnsafe(messages, IncomingAgentMessage.SessionReady());
            }),
            client.onMessage('tool-call', (payload) => {
              Queue.offerUnsafe(messages, IncomingAgentMessage.ToolCall({ payload }));
            }),
          ] as const
      ),
      (subscriptions) =>
        Effect.sync(() => {
          for (const subscription of subscriptions) {
            subscription.remove();
          }
        })
    );

    const handleMessage = Effect.fn('RozeniteAgentTools.handleMessage')(function* (
      message: IncomingAgentMessage
    ) {
      return yield* Match.value(message).pipe(
        Match.tagsExhaustive({
          SessionReady: () => register(),
          ToolCall: ({ payload }) => {
            const tool = Array.findFirst(
              atomDevToolsAgentTools,
              (i) => i.tool.name === payload.toolName
            );
            if (Option.isNone(tool)) {
              return Effect.void;
            }

            return tool.value.execute(payload.arguments).pipe(
              Effect.matchCauseEffect({
                onSuccess: (result) =>
                  Effect.sync(() => {
                    client.send('tool-result', {
                      callId: payload.callId,
                      success: true,
                      result,
                    });
                  }),
                onFailure: (cause) =>
                  Effect.sync(() => {
                    const error = Cause.squash(cause);
                    client.send('tool-result', {
                      callId: payload.callId,
                      success: false,
                      error: error instanceof Error ? error.message : String(error),
                    });
                  }),
              })
            );
          },
        })
      );
    });

    yield* register();
    yield* Stream.fromQueue(messages).pipe(
      Stream.mapEffect(handleMessage, { concurrency: 'unbounded', unordered: true }),
      Stream.runDrain,
      Effect.forkScoped
    );

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        client.send('unregister-tool', {
          toolNames: atomDevToolsAgentTools.map(({ tool }) => tool.name),
        });
      }).pipe(Effect.andThen(Queue.shutdown(messages)))
    );
  })
);

const AtomDevToolsRozeniteAgentToolsLive = Layer.effectDiscard(
  Layer.build(AtomDevToolsRozeniteAgentTools).pipe(Effect.forkScoped)
);

export const AtomDevToolsRozeniteLive = Layer.mergeAll(
  AtomDevToolsRozeniteRpcLive,
  AtomDevToolsRozeniteAgentToolsLive
).pipe(Layer.provideMerge(AtomDevTools.layer));
