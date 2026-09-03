import { Duration, Effect, Layer, Option, Schedule, Stream } from 'effect';

import { AccountManager } from '#src/services/accounts/index.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { LibraryDatabaseMap } from '#src/services/database/library/index.ts';

const retrySchedule = Schedule.exponential('1 second').pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.minutes(1)))
  ),
  Schedule.jittered
);

const make = Effect.gen(function* () {
  const accounts = yield* AccountManager;
  const authClients = yield* AuthClientMap;
  const libraryDatabases = yield* LibraryDatabaseMap;

  const retain = (account: ActiveAccountKey) =>
    Effect.scoped(
      Effect.gen(function* () {
        // Keep authentication alive independently while replica acquisition is retried.
        yield* authClients.contextEffect(account);
        return yield* Effect.scoped(
          Effect.gen(function* () {
            yield* libraryDatabases.contextEffect(account);
            return yield* Effect.never;
          })
        ).pipe(
          Effect.tapError((error) =>
            Effect.logWarning('Failed to open the active library replica', error)
          ),
          Effect.retry(retrySchedule)
        );
      })
    ).pipe(
      Effect.tapError((error) =>
        Effect.logWarning('Failed to open the active account resources', error)
      ),
      Effect.retry(retrySchedule),
      Effect.annotateLogs({
        server_url: account.serverUrl,
        user_id: account.userId,
      })
    );

  yield* accounts.changes.pipe(
    Stream.switchMap(
      Option.match({
        onNone: () => Stream.never,
        onSome: (account) => Stream.fromEffect(retain(account)),
      })
    ),
    Stream.runDrain,
    Effect.forkScoped({ startImmediately: true })
  );
});

/** Retains the active account's scoped clients and databases for the app's lifetime. */
export const ActiveAccountResources = {
  layerNoDeps: Layer.effectDiscard(make),

  layer: Layer.effectDiscard(make).pipe(Layer.provide([AccountManager.layer, AuthClientMap.layer])),
};
