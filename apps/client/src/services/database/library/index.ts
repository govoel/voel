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

/** A read-only local replica of one account's server-side `library.db`. */
export class LibraryDatabase extends Context.Service<LibraryDatabase>()(
  'voel/services/database/library/LibraryDatabase',
  {
    make: Effect.fnUntraced(function* ({
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
      const { TursoSyncClient } = yield* Effect.promise(
        async () => import('@repo/effect-turso-sync-rn')
      );
      const runPromise = Effect.runPromiseWith(yield* Effect.context());

      return yield* TursoSyncClient.make({
        path: replicaFilename({ filename, identity }),
        url: syncUrl(account.serverUrl),
        // Turso asks for credentials before every request, allowing Better Auth
        // to rotate or invalidate a session without rebuilding the replica.
        authToken: async () => runPromise(authToken(authentication)),
        bootstrapIfEmpty: true,
        longPollTimeoutMs: 30_000,
        onConnect: ({ exec }) =>
          exec('PRAGMA foreign_keys = ON').pipe(Effect.andThen(exec('PRAGMA query_only = ON'))),
      });
    }),
  }
) {
  public static readonly layerNoDeps = (account: ActiveAccountKey) =>
    Layer.effect(
      this,
      Effect.service(AppConfig).pipe(
        Effect.flatMap((config) => this.make({ account, filename: config.libraryDb.filename }))
      )
    );

  public static readonly layer = (account: ActiveAccountKey) =>
    this.layerNoDeps(account).pipe(
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
export class LibraryDatabaseMap extends LayerMap.Service<LibraryDatabaseMap>()(
  'voel/services/database/library/LibraryDatabaseMap',
  {
    dependencies: [AppConfig.layer, AuthClientMap.layer, Reactivity.layer, XxHash.layer],
    lookup: (account: ActiveAccountKey) =>
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const database = yield* LibraryDatabase.make({
          account,
          filename: config.libraryDb.filename,
        });
        return Context.make(LibraryDatabase, database).pipe(
          Context.add(SqlClient.SqlClient, database)
        );
      }).pipe(
        Layer.effectContext,
        Layer.tap((context) =>
          synchronizeLibraryDatabase({
            account,
            database: Context.get(context, LibraryDatabase),
          })
        )
      ),
  }
) {}

export const acquireLibraryDatabase = (account: ActiveAccountKey) =>
  LibraryDatabaseMap.contextEffect(account).pipe(Effect.map(Context.get(LibraryDatabase)));
