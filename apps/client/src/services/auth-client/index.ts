import { expoClient } from '@better-auth/expo/client';
import { Context, Duration, Effect, Layer, LayerMap, Option, Schema, Stream, String } from 'effect';
import { AsyncResult, Reactivity } from 'effect/unstable/reactivity';

import { AuthClient as CoreAuthClient } from '@repo/auth-api/client.ts';

import { AccountRepository } from '#src/services/accounts/repository.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import type { Account } from '#src/services/database/main/schema.ts';

export const makeAuthStorageKey = ({
  serverUrl,
  authStorageId,
}: {
  readonly serverUrl: string;
  readonly authStorageId: string;
}) => `voel::auth::${serverUrl}::${authStorageId}`;

export type AuthClientKey = Pick<Account, 'serverUrl' | 'authStorageId'>;

class AuthClientGetCookieError extends Schema.TaggedError<
  AuthClientGetCookieError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/AuthClientGetCookieError')('AuthClientGetCookieError', {}) {}

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/services/auth-client/AuthClient',
  {
    make: Effect.fnUntraced(function* (key: AuthClientKey) {
      const xxHash = yield* XxHash;
      const storagePrefix = yield* xxHash.hash128(
        makeAuthStorageKey({ serverUrl: key.serverUrl, authStorageId: key.authStorageId })
      );

      const storage = yield* AuthClientStorage;
      const context = yield* Effect.context();
      const runPromise = Effect.runPromiseWith(context);
      const runSync = Effect.runSyncWith(context);

      const { rawClient, ...client } = yield* CoreAuthClient.make({
        baseURL: key.serverUrl,
        plugins: [
          expoClient({
            storage: {
              getItem: (k) => runSync(storage.getItem(k).pipe(Effect.map(Option.getOrNull))),
              getItemAsync: async (k) =>
                runPromise(storage.getItem(k).pipe(Effect.map(Option.getOrNull))),
              setItem: (k, v) => {
                runSync(storage.setItem(k, v));
              },
              setItemAsync: async (k, v) => {
                await runPromise(storage.setItem(k, v));
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

      const getCookie = Effect.tryPromise({
        try: async () => rawClient.getCookie(),
        catch: () => AuthClientGetCookieError.make(),
      }).pipe(Effect.map(Option.liftPredicate(String.isNonEmpty)));

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
  const accountRepository = yield* AccountRepository;

  yield* authClient.sessionChanges.pipe(
    Stream.runForEach(
      Effect.fnUntraced(
        function* (session) {
          if (!AsyncResult.isSuccess(session) || Option.isNone(session.value)) {
            return;
          }

          const account = yield* accountRepository.getByStorageKey({
            serverUrl: key.serverUrl,
            userId: session.value.value.user.id,
            authStorageId: key.authStorageId,
          });
          if (Option.isNone(account)) {
            return;
          }

          if (
            account.value.username === session.value.value.user.username &&
            account.value.name === session.value.value.user.name &&
            account.value.email === session.value.value.user.email &&
            account.value.role === session.value.value.user.role &&
            account.value.profilePicture === session.value.value.user.image
          ) {
            return;
          }

          yield* accountRepository
            .updateProfile({
              serverUrl: key.serverUrl,
              userId: session.value.value.user.id,
              authStorageId: key.authStorageId,
              username: session.value.value.user.username,
              name: session.value.value.user.name,
              email: session.value.value.user.email,
              role: session.value.value.user.role,
              profilePicture: session.value.value.user.image,
            })
            .pipe(Reactivity.mutation(['account']));
        },
        (effect) =>
          effect.pipe(
            Effect.catchTags({
              SchemaError: (error) =>
                Effect.logError('Failed to synchronize account from session', error),
              SqlError: (error) =>
                Effect.logError('Failed to synchronize account from session', error),
            })
          )
      )
    ),
    Effect.forkScoped({ startImmediately: true })
  );
});

export class AuthClientMap extends LayerMap.Service<AuthClientMap>()(
  'voel/services/auth-client/AuthClientMap',
  {
    dependencies: [
      AccountRepository.layer,
      AuthClientStorage.layer,
      Reactivity.layer,
      XxHash.layer,
    ],
    lookup: (key: AuthClientKey) =>
      AuthClient.layerNoDeps(key).pipe(
        Layer.tap((context) => synchronizeAccountFromSession(key, Context.get(context, AuthClient)))
      ),
  }
) {}

export const acquireAuthClient = (key: AuthClientKey) =>
  AuthClientMap.contextEffect(key).pipe(Effect.map(Context.get(AuthClient)));
