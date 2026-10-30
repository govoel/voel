import { Context, Effect, Layer, LayerMap, Option, Schedule, Stream } from 'effect';
import { Digest } from 'effect/crypto';
import { AsyncResult, Reactivity } from 'effect/reactivity';
import { SqlClient } from 'effect/sql';

import type { TursoSyncClientOptions } from '@repo/effect-turso-sync';

import { AppConfig } from '#src/config.ts';
import { TursoSyncClientFactory } from '#src/database/factory/index.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { ExpoDigestLayer } from '#src/runtime/crypto.ts';

const retrySchedule = Schedule.min([
  Schedule.exponential('1 second'),
  Schedule.spaced('1 minute'),
]).pipe(Schedule.jittered);

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
  readonly account: AccountKey;
  readonly filenameSuffix: string;
}) {
  const authentication = yield* AuthClientMap.use((authClients) => authClients.acquire(account));
  const digest = yield* Digest.Digest;
  const identity = yield* AccountKey.encodeIdentity(account).pipe(
    Effect.catchTags({ SchemaError: Effect.die })
  );
  const filename = yield* digest.digestHex(Digest.sha256, new TextEncoder().encode(identity));

  return {
    // A stable, filesystem-safe name for this server/user pair, across logins.
    path: `${filenameSuffix}-${filename}.db`,
    url: new URL('/api/sync/library', account.serverUrl).toString(),
    // Turso asks for credentials before every request, allowing Better Auth
    // to rotate or invalidate a session without rebuilding the replica.
    authToken: authToken(authentication),
    bootstrapIfEmpty: true,
    longPollTimeoutMs: 30_000,
    onConnect: Effect.fnUntraced(function* (sql) {
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
  'voel/domains/library/database/LibraryDatabase',
  {
    make: Effect.fnUntraced(function* (account: AccountKey) {
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
  public static readonly layerNoDeps = (account: AccountKey) =>
    Layer.effectContext(
      this.make(account).pipe(
        Effect.map((client) =>
          Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
        )
      )
    );

  public static readonly layer = (account: AccountKey) =>
    this.layerNoDeps(account).pipe(
      Layer.provide([AppConfig.layer, AuthClientMap.layer, Reactivity.layer, ExpoDigestLayer])
    );
}

const synchronizeLibraryDatabase = Effect.fnUntraced(function* ({
  account,
  database,
}: {
  readonly account: AccountKey;
  readonly database: LibraryDatabase['Service'];
}) {
  yield* database.pull.pipe(
    Effect.tap((changed) => (changed ? Reactivity.invalidate(['library']) : Effect.void)),
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
export class LibraryDatabaseMap extends Context.Service<LibraryDatabaseMap>()(
  'voel/domains/library/database/LibraryDatabaseMap',
  {
    make: LayerMap.make(
      (account: AccountKey) =>
        LibraryDatabase.layerNoDeps(account).pipe(
          Layer.tap((context) =>
            synchronizeLibraryDatabase({
              account,
              database: Context.get(context, LibraryDatabase),
            })
          )
        ),
      { idleTimeToLive: '5 minutes' }
    ).pipe(
      Effect.map((map) => ({
        ...map,
        /** Acquire one replica per canonical account identity in the caller's scope. */
        acquire: (account: AccountKey) =>
          map.contextEffect(account).pipe(Effect.map(Context.get(LibraryDatabase))),
      }))
    ),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AppConfig.layer, AuthClientMap.layer, Reactivity.layer, ExpoDigestLayer])
  );
}
