import { Effect, Exit, Fiber, Scope, Semaphore } from 'effect';

import type { TursoSyncClientOptions } from '#src/index.ts';

/** Shared by the platform adapters: serialize sync, but never lease the SQL connection. */
export const makeSyncOperations = Effect.fnUntraced(function* <R>({
  authToken,
}: {
  authToken: TursoSyncClientOptions<R>['authToken'];
}) {
  const runPromise = Effect.runPromiseWith(yield* Effect.context<R>());
  const semaphore = yield* Semaphore.make(1);
  // Credentials are only available during an owned connect/pull operation.
  let signal = yield* Effect.scoped(Effect.abortSignal);

  const withSyncOperation = <A, E, Services>(operation: Effect.Effect<A, E, Services>) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.scopedWith((scope) =>
        Effect.gen(function* () {
          signal = yield* Effect.abortSignal.pipe(Scope.provide(scope));
          // Native promises cannot simply be abandoned. Keep the worker alive while
          // interruption aborts credential acquisition, then drain it before unlocking.
          const worker = yield* Effect.forkChild(operation, { uninterruptible: true });
          return yield* restore(Fiber.join(worker)).pipe(
            Effect.onInterrupt(() =>
              Scope.close(scope, Exit.void).pipe(Effect.andThen(Fiber.await(worker)), Effect.asVoid)
            )
          );
        })
      )
    ).pipe(Semaphore.withPermit(semaphore));

  return {
    ...(authToken ? { authToken: async () => runPromise(authToken, { signal }) } : {}),
    withSyncOperation,
  };
});
