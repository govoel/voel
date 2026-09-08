import { Context, Duration, Effect, Layer, LayerMap, Option, Schedule, Stream } from 'effect';
import { AsyncResult, Reactivity } from 'effect/unstable/reactivity';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import type { TursoSyncClientOptions } from '@repo/effect-turso-sync';

import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { AuthClientMap, acquireAuthClient } from '#src/services/auth-client/index.ts';
import type { AuthClient } from '#src/services/auth-client/index.ts';
import { AppConfig } from '#src/services/config.ts';
import { TursoSyncClientFactory } from '#src/services/database/factory/index.ts';

const retrySchedule = Schedule.exponential('1 second').pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.minutes(1)))
  ),
  Schedule.jittered
);

const authToken = Effect.fnUntraced(function* (authClient: AuthClient['Service']) {
  return yield* authClient.sessionChanges.pipe(
    Stream.filter((session) => !session.waiting),
    Stream.filter(AsyncResult.isSuccess),
    Stream.map((result) => result.value),
    Stream.filter(Option.isSome),
    Stream.map((session) => session.value.session.token),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        // An ended session stream cannot supply credentials; cancel this request.
        onNone: () => Effect.interrupt,
        onSome: Effect.succeed,
      })
    )
  );
});

const makeLibraryDatabaseOptions = Effect.fnUntraced(function* ({
  account,
  filenameSuffix,
}: {
  readonly account: ActiveAccountKey;
  readonly filenameSuffix: string;
}) {
  const authentication = yield* acquireAuthClient(account);

  return {
    // Auth storage identity is unique to each sign-in, including across servers.
    path: `${filenameSuffix}-${account.authStorageId}.db`,
    url: new URL('/api/sync/library', account.serverUrl).toString(),
    // Turso asks for credentials before every request, allowing Better Auth
    // to rotate or invalidate a session without rebuilding the replica.
    authToken: authToken(authentication),
    bootstrapIfEmpty: true,
    longPollTimeoutMs: 30_000,
    onConnect: (sql) =>
      Effect.gen(function* () {
        yield* sql`
          pragma foreign_keys = on
        `;
        yield* sql`
          pragma query_only = 1
        `;
      }),
  } satisfies TursoSyncClientOptions;
});

/** A read-only local replica of one account's server-side `library.db`. */
export class LibraryDatabase extends Context.Service<LibraryDatabase>()(
  'voel/services/database/library/LibraryDatabase',
  {
    make: Effect.fnUntraced(function* (account: ActiveAccountKey) {
      const config = yield* AppConfig;
      const factory = yield* TursoSyncClientFactory;
      const options = yield* makeLibraryDatabaseOptions({
        account,
        filenameSuffix: config.libraryDb.filenameSuffix,
      });

      return yield* factory.make(options);
    }),
  }
) {
  public static readonly layerNoDeps = (account: ActiveAccountKey) =>
    Layer.effectContext(
      this.make(account).pipe(
        Effect.map((client) =>
          Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
        )
      )
    );

  public static readonly layer = (account: ActiveAccountKey) =>
    this.layerNoDeps(account).pipe(
      Layer.provide([AppConfig.layer, AuthClientMap.layer, Reactivity.layer])
    );
}

const synchronizeLibraryDatabase = Effect.fnUntraced(function* ({
  account,
  database,
}: {
  readonly account: ActiveAccountKey;
  readonly database: LibraryDatabase['Service'];
}) {
  const reactivity = yield* Reactivity.Reactivity;

  yield* database.pull.pipe(
    Effect.tap((changed) => (changed ? reactivity.invalidate(['library']) : Effect.void)),
    Effect.tapError((error) => Effect.logWarning('Library synchronization failed', error)),
    Effect.retry(retrySchedule),
    Effect.repeat(Schedule.spaced('1 second')),
    Effect.annotateLogs({
      database: 'library',
      server_url: account.serverUrl,
      user_id: account.userId,
    }),
    Effect.forkScoped({ startImmediately: true })
  );
});

/** Lazily owns, scopes, and synchronizes one physical replica per account. */
export class LibraryDatabaseMap extends LayerMap.Service<LibraryDatabaseMap>()(
  'voel/services/database/library/LibraryDatabaseMap',
  {
    idleTimeToLive: '5 minutes',
    lookup: (account: ActiveAccountKey) =>
      LibraryDatabase.layerNoDeps(account).pipe(
        Layer.tap((context) =>
          synchronizeLibraryDatabase({
            account,
            database: Context.get(context, LibraryDatabase),
          })
        )
      ),
    dependencies: [AppConfig.layer, AuthClientMap.layer, Reactivity.layer],
  }
) {}

export const acquireLibraryDatabase = (account: ActiveAccountKey) =>
  LibraryDatabaseMap.contextEffect(account).pipe(Effect.map(Context.get(LibraryDatabase)));
