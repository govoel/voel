import {
  Cause,
  Context,
  Duration,
  Effect,
  Layer,
  LayerMap,
  Option,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { AsyncResult, Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';
import type { SqlError } from 'effect/unstable/sql';

import { TursoSyncClient } from '@repo/effect-turso-sync-core';
import type { TursoSyncClientOptions } from '@repo/effect-turso-sync-core';

import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { AuthClientMap, acquireAuthClient } from '#src/services/auth-client/index.ts';
import type { AuthClient } from '#src/services/auth-client/index.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { AppConfig } from '#src/services/config.ts';

class LibraryAuthenticationError extends Schema.TaggedError<
  LibraryAuthenticationError,
  { readonly brand: unique symbol }
>('voel/services/database/library/LibraryAuthenticationError')('LibraryAuthenticationError', {
  cause: Schema.Defect(),
}) {}

const syncUrl = (serverUrl: string) => new URL('/api/sync/library', serverUrl).toString();

const retrySchedule = Schedule.exponential('1 second').pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.minutes(1)))
  ),
  Schedule.jittered
);

/**
 * Keeps replicas for different accounts in separate files. A Turso Sync
 * database persists remote identity alongside the database, so reusing one
 * file after switching servers would cross a security boundary.
 */
const replicaFilename = ({ filename, identity }: { filename: string; identity: string }) => {
  if (filename === ':memory:') {
    return filename;
  }

  const safeIdentity = encodeURIComponent(identity);
  const separator = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const extension = filename.lastIndexOf('.');
  return extension > separator
    ? `${filename.slice(0, extension)}.${safeIdentity}${filename.slice(extension)}`
    : `${filename}.${safeIdentity}`;
};

const authToken = Effect.fnUntraced(function* (authClient: AuthClient['Service']) {
  const result = yield* authClient.sessionChanges.pipe(
    Stream.filter((session) => !session.waiting),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            LibraryAuthenticationError.make({
              cause: new Error('The authentication session stream ended'),
            })
          ),
        onSome: Effect.succeed,
      })
    )
  );

  if (!AsyncResult.isSuccess(result) || Option.isNone(result.value)) {
    return yield* LibraryAuthenticationError.make({
      cause: AsyncResult.isFailure(result)
        ? Cause.squash(result.cause)
        : new Error('The account is not authenticated'),
    });
  }

  return result.value.value.session.token;
});

const makeLibraryDatabaseOptions = Effect.fnUntraced(function* ({
  account,
  filename,
}: {
  readonly account: ActiveAccountKey;
  readonly filename: string;
}) {
  const authentication = yield* acquireAuthClient(account);
  const xxHash = yield* XxHash;
  const identity = yield* xxHash.hash128(
    `${account.serverUrl}\u0000${account.userId}\u0000${account.authStorageId}`
  );
  const runPromise = Effect.runPromiseWith(yield* Effect.context());

  return {
    path: replicaFilename({ filename, identity }),
    url: syncUrl(account.serverUrl),
    // Turso asks for credentials before every request, allowing Better Auth
    // to rotate or invalidate a session without rebuilding the replica.
    authToken: async () => runPromise(authToken(authentication)),
    bootstrapIfEmpty: true,
    longPollTimeoutMs: 30_000,
    onConnect: ({ exec }) =>
      exec('PRAGMA foreign_keys = ON').pipe(Effect.andThen(exec('PRAGMA query_only = ON'))),
  } satisfies TursoSyncClientOptions;
});

/** A read-only local replica of one account's server-side `library.db`. */
export class LibraryDatabase extends Context.Service<LibraryDatabase>()(
  'voel/services/database/library/LibraryDatabase',
  { make: (client: TursoSyncClient['Service']) => Effect.succeed(client) }
) {
  public static readonly layerNoDeps = (
    account: ActiveAccountKey,
    clientLayer: (
      options: TursoSyncClientOptions
    ) => Layer.Layer<TursoSyncClient | SqlClient.SqlClient, SqlError.SqlError>
  ) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const options = yield* makeLibraryDatabaseOptions({
          account,
          filename: config.libraryDb.filename,
        });

        return Layer.effectContext(
          TursoSyncClient.pipe(
            Effect.map((client) =>
              Context.make(LibraryDatabase, client).pipe(Context.add(SqlClient.SqlClient, client))
            )
          )
        ).pipe(Layer.provide(clientLayer(options)));
      })
    );

  public static readonly layer = (
    account: ActiveAccountKey,
    clientLayer: Parameters<typeof this.layerNoDeps>[1]
  ) =>
    this.layerNoDeps(account, clientLayer).pipe(
      Layer.provide([AppConfig.layer, AuthClientMap.layer, XxHash.layer])
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
export class LibraryDatabaseMap extends Context.Service<LibraryDatabaseMap>()(
  'voel/services/database/library/LibraryDatabaseMap',
  {
    make: (clientLayer: Parameters<typeof LibraryDatabase.layerNoDeps>[1]) =>
      LayerMap.make((account: ActiveAccountKey) =>
        LibraryDatabase.layerNoDeps(account, clientLayer).pipe(
          Layer.tap((context) =>
            synchronizeLibraryDatabase({
              account,
              database: Context.get(context, LibraryDatabase),
            })
          )
        )
      ),
  }
) {
  public static readonly layerNoDeps = (
    clientLayer: Parameters<typeof LibraryDatabase.layerNoDeps>[1]
  ) => Layer.effect(this, this.make(clientLayer));

  public static readonly layer = (clientLayer: Parameters<typeof this.layerNoDeps>[0]) =>
    this.layerNoDeps(clientLayer).pipe(
      Layer.provide([AppConfig.layer, AuthClientMap.layer, Reactivity.layer, XxHash.layer])
    );

  public static readonly contextEffect = (account: ActiveAccountKey) =>
    Effect.flatMap(this, (databases) => databases.contextEffect(account));
}

export const acquireLibraryDatabase = (account: ActiveAccountKey) =>
  LibraryDatabaseMap.contextEffect(account).pipe(Effect.map(Context.get(LibraryDatabase)));
