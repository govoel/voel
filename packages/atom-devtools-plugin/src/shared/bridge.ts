import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';

type EventMap = Record<string, unknown>;

export const subscribe = <Events extends EventMap, S extends Schema.Decoder<unknown>, E>(
  client: RozeniteDevToolsClient<Events>,
  options: {
    readonly event: keyof Events;
    readonly schema: S;
    readonly handler: (payload: S['Type']) => Effect.Effect<void, E>;
  }
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() =>
      client.onMessage(options.event, (payload) => {
        Effect.runFork(
          Schema.decodeUnknownEffect(options.schema)(payload).pipe(
            Effect.flatMap(options.handler),
            Effect.catchCause((cause) =>
              Effect.logWarning(
                `Ignored invalid Atom DevTools "${String(options.event)}" message.`
              ).pipe(Effect.annotateLogs({ cause }))
            )
          )
        );
      })
    ),
    (subscription) => Effect.sync(subscription.remove)
  ).pipe(Effect.asVoid);
