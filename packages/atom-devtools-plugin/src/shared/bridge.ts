import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';

const noop = (): void => void 0;

export const subscribe = <
  Events extends Record<string, unknown>,
  S extends Schema.Decoder<unknown>,
  E,
>(
  client: RozeniteDevToolsClient<Events>,
  options: {
    readonly event: keyof Events;
    readonly schema: S;
    readonly handler: (payload: S['Type']) => Effect.Effect<void, E>;
  }
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const context = yield* Effect.context();
    const interruptors = new Set<() => void>();
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const interrupt of interruptors) {
          interrupt();
        }
        interruptors.clear();
      })
    );
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        client.onMessage(options.event, (payload) => {
          const run = Effect.runCallbackWith(context);
          const active = { interrupt: noop };
          const interrupt = (): void => {
            active.interrupt();
          };
          interruptors.add(interrupt);
          active.interrupt = run(
            Schema.decodeUnknownEffect(options.schema)(payload).pipe(
              Effect.flatMap(options.handler),
              Effect.catchCause((cause) =>
                Effect.logWarning(
                  `Ignored invalid Atom DevTools "${String(options.event)}" message.`
                ).pipe(Effect.annotateLogs({ cause }))
              )
            ),
            {
              onExit: () => {
                interruptors.delete(interrupt);
              },
            }
          );
        })
      ),
      (subscription) =>
        Effect.sync(() => {
          subscription.remove();
        })
    );
  }).pipe(Effect.asVoid);

export const encodePayload = <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  payload: S['Type']
): S['Encoded'] => Schema.encodeSync(schema)(payload);
