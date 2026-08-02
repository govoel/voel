import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect } from 'effect';
import type { Schema, Scope } from 'effect';

interface DecodeableSchema extends Schema.Decoder<unknown> {
  readonly decodeUnknownEffect: (input: unknown) => Effect.Effect<this['Type'], Schema.SchemaError>;
}

export const subscribe = <Events extends Record<string, unknown>, S extends DecodeableSchema, E>(
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
          options.schema.decodeUnknownEffect(payload).pipe(
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
