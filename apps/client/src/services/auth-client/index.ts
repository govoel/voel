import { expoClient } from '@better-auth/expo/client';
import { Context, Data, Duration, Effect, Layer, LayerMap, Option, Stream, String } from 'effect';
import { AsyncResult, Reactivity } from 'effect/unstable/reactivity';

import { AuthClient as CoreAuthClient } from '@repo/auth-api/client.ts';
import type { Selectable } from '@repo/effect-kysely';

import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

export const makeAuthStorageKey = ({
  serverUrl,
  authStorageId,
}: {
  readonly serverUrl: string;
  readonly authStorageId: string;
}) => `voel::auth::${serverUrl}::${authStorageId}`;

export class AuthClientKey extends Data.Class<
  Pick<Selectable<AccountTable>, 'serverUrl' | 'authStorageId'>
> {}

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/services/auth-client/AuthClient',
  {
    make: Effect.fnUntraced(function* (key: AuthClientKey) {
      const xxHash = yield* XxHash;
      const storagePrefix = yield* xxHash.hash128(
        makeAuthStorageKey({ serverUrl: key.serverUrl, authStorageId: key.authStorageId })
      );

      const storage = yield* AuthClientStorage;
      const runSync = Effect.runSyncWith(yield* Effect.context());

      const { rawClient, ...client } = yield* CoreAuthClient.make({
        baseURL: key.serverUrl,
        plugins: [
          expoClient({
            storage: {
              getItem: (k) => runSync(storage.getItem(k).pipe(Effect.map(Option.getOrNull))),
              setItem: (k, v) => {
                runSync(storage.setItem(k, v));
              },
            },
            storagePrefix,
            cookiePrefix: 'auth',
          }),
        ],
        sessionOptions: {
          refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
        },
      });

      const getCookie = Effect.sync(() =>
        Option.liftPredicate(rawClient.getCookie(), String.isNonEmpty)
      );

      return {
        getCookie,
        ...client,
      };
    }),
  }
) {
  public static readonly layerNoDeps = (key: AuthClientKey) => Layer.effect(this, this.make(key));

  public static readonly layer = (key: AuthClientKey) =>
    this.layerNoDeps(key).pipe(
      Layer.provide(Layer.mergeAll(AuthClientStorage.layer, XxHash.layer))
    );
}

const synchronizeAccountFromSession = Effect.fnUntraced(function* (
  key: AuthClientKey,
  authClient: AuthClient['Service']
) {
  const db = yield* MainDatabase;

  yield* authClient.sessionChanges.pipe(
    Stream.runForEach(
      Effect.fnUntraced(
        function* (session) {
          if (!AsyncResult.isSuccess(session) || Option.isNone(session.value)) {
            return;
          }

          const { user } = session.value.value;
          const userId = user.id;
          const sessionAccount = {
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            profilePicture: user.image,
          };
          const account = yield* db.executeTakeFirstOption(
            db
              .selectFrom('account')
              .where('serverUrl', '=', key.serverUrl)
              .where('userId', '=', userId)
              .where('authStorageId', '=', key.authStorageId)
              .selectAll()
          );
          if (Option.isNone(account)) {
            return;
          }

          if (
            account.value.username === sessionAccount.username &&
            account.value.name === sessionAccount.name &&
            account.value.email === sessionAccount.email &&
            account.value.role === sessionAccount.role &&
            account.value.profilePicture === sessionAccount.profilePicture
          ) {
            return;
          }

          yield* db
            .executeTakeFirstOption(
              db
                .updateTable('account')
                .set({
                  username: sessionAccount.username,
                  name: sessionAccount.name,
                  email: sessionAccount.email,
                  role: sessionAccount.role,
                  profilePicture: sessionAccount.profilePicture,
                })
                .where('serverUrl', '=', key.serverUrl)
                .where('userId', '=', userId)
                .where('authStorageId', '=', key.authStorageId)
                .returningAll()
            )
            .pipe(Reactivity.mutation(['account']));
        },
        (effect) =>
          effect.pipe(
            Effect.catchTag('DatabaseSqlError', (error) =>
              Effect.logError('Failed to synchronize account from session', error)
            )
          )
      )
    ),
    Effect.forkScoped({ startImmediately: true })
  );
});

export class AuthClientMap extends LayerMap.Service<AuthClientMap>()(
  'voel/services/auth-client/index/AuthClientMap',
  {
    dependencies: [AuthClientStorage.layer, MainDatabase.layer, Reactivity.layer, XxHash.layer],
    lookup: (key: AuthClientKey) =>
      AuthClient.layerNoDeps(key).pipe(
        Layer.tap((context) => synchronizeAccountFromSession(key, Context.get(context, AuthClient)))
      ),
  }
) {}

export const acquireAuthClient = (key: {
  readonly authStorageId: AuthClientKey['authStorageId'];
  readonly serverUrl: AuthClientKey['serverUrl'];
}) => AuthClientMap.contextEffect(new AuthClientKey(key)).pipe(Effect.map(Context.get(AuthClient)));
