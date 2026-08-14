import type {
  AgentSessionReadyMessage,
  RegisterToolMessage,
  ToolCallMessage,
  ToolResultMessage,
  UnregisterToolMessage,
} from '@rozenite/agent-shared';
import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Array, Cause, Data, Effect, Layer, Match, Option, Queue, Stream } from 'effect';

import { agentToolHandlers } from '#src/react-native/agent/tool-handlers.ts';

const ROZENITE_AGENT_PLUGIN_ID = 'rozenite-agent';

// Rozenite's event-map constraint works with a closed type alias rather than an interface.
// oxlint-disable-next-line typescript/consistent-type-definitions
type AgentBridgeEventMap = {
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

const AgentToolsRegistrationLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const agentClient = yield* Effect.acquireRelease(
      Effect.promise(async () =>
        getRozeniteDevToolsClient<AgentBridgeEventMap>(ROZENITE_AGENT_PLUGIN_ID)
      ),
      (client) =>
        Effect.sync(() => {
          client.close();
        })
    );
    const incomingMessages = yield* Queue.unbounded<IncomingAgentMessage>();

    const registerAgentTools = Effect.sync(() => {
      agentClient.send('register-tool', {
        tools: agentToolHandlers.map(({ tool }) => tool),
      });
    });

    yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          [
            agentClient.onMessage('agent-session-ready', () => {
              Queue.offerUnsafe(incomingMessages, IncomingAgentMessage.SessionReady());
            }),
            agentClient.onMessage('tool-call', (payload) => {
              Queue.offerUnsafe(incomingMessages, IncomingAgentMessage.ToolCall({ payload }));
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

    const handleAgentMessage = Effect.fnUntraced(function* (message: IncomingAgentMessage) {
      return yield* Match.value(message).pipe(
        Match.tagsExhaustive({
          SessionReady: () => registerAgentTools,
          ToolCall: ({ payload }) => {
            const handler = Array.findFirst(
              agentToolHandlers,
              ({ tool }) => tool.name === payload.toolName
            );
            if (Option.isNone(handler)) {
              return Effect.void;
            }

            return handler.value.execute(payload.arguments).pipe(
              Effect.matchCauseEffect({
                onSuccess: (result) =>
                  Effect.sync(() => {
                    agentClient.send('tool-result', {
                      callId: payload.callId,
                      success: true,
                      result,
                    });
                  }),
                onFailure: (cause) =>
                  Effect.sync(() => {
                    const error = Cause.squash(cause);
                    agentClient.send('tool-result', {
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

    yield* registerAgentTools;
    yield* Stream.fromQueue(incomingMessages).pipe(
      Stream.mapEffect(handleAgentMessage, { concurrency: 'unbounded', unordered: true }),
      Stream.runDrain,
      Effect.forkScoped
    );

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        agentClient.send('unregister-tool', {
          toolNames: agentToolHandlers.map(({ tool }) => tool.name),
        });
      }).pipe(Effect.andThen(Queue.shutdown(incomingMessages)))
    );
  })
);

export const AgentToolsLayer = Layer.effectDiscard(
  Layer.build(AgentToolsRegistrationLayer).pipe(Effect.forkScoped)
);
