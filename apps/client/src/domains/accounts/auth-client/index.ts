import { expoClient } from '@better-auth/expo/client';
import type { ExpoClientStorage } from '@better-auth/expo/client';
import {
  Context,
  Duration,
  Effect,
  Layer,
  LayerMap,
  Match,
  Option,
  Schema,
  Stream,
  String,
} from 'effect';
import { AsyncResult, Reactivity } from 'effect/reactivity';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { AuthClient as CoreAuthClient } from '@repo/auth-api/client.ts';

import {
  makeAccountAuthStorage,
  makeMemoryAuthStorage,
} from '#src/domains/accounts/auth-client/storage.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';

class AuthClientGetCookieError extends Schema.TaggedError<
  AuthClientGetCookieError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/auth-client/AuthClientGetCookieError')('AuthClientGetCookieError', {}) {}

const userAgent =
  Device.deviceName ??
  Device.modelName ??
  Match.value(Platform.OS).pipe(
    Match.literalsExhaustive({
      android: () => 'Android',
      ios: () => 'iOS',
      macos: () => 'MacOS',
      web: () => 'Web',
      windows: () => 'Windows',
    })
  );

const clientOptions = ({
  serverUrl,
  storage,
}: Pick<AccountKey, 'serverUrl'> & { readonly storage: ExpoClientStorage }) => ({
  baseURL: serverUrl,
  fetchOptions: { headers: { 'User-Agent': userAgent } },
  // Storage is already scoped to an account row; no additional namespace ID.
  plugins: [expoClient({ storage, storagePrefix: 'voel', cookiePrefix: 'auth' })],
  sessionOptions: { refetchInterval: Duration.toSeconds(Duration.minutes(5)) },
});

const makeClient = Effect.fnUntraced(function* (options: Parameters<typeof clientOptions>[0]) {
  const { rawClient, ...client } = yield* CoreAuthClient.make(clientOptions(options));
  return {
    ...client,
    getCookie: Effect.tryPromise({
      try: async () => rawClient.getCookie(),
      catch: () => AuthClientGetCookieError.make(),
    }).pipe(Effect.map(Option.liftPredicate(String.isNonEmpty))),
  };
});

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/domains/accounts/auth-client/AuthClient',
  {
    make: Effect.fnUntraced(function* (key: AccountKey) {
      return yield* makeClient({
        serverUrl: key.serverUrl,
        storage: yield* makeAccountAuthStorage(key),
      });
    }),
  }
) {
  public static readonly layerNoDeps = (key: AccountKey) => Layer.effect(this, this.make(key));
  public static readonly layer = (key: AccountKey) =>
    this.layerNoDeps(key).pipe(Layer.provide(AccountRepository.layer));

  /** An isolated in-memory client whose credentials can be persisted after authentication. */
  public static readonly makeTemporary = Effect.fnUntraced(function* ({
    serverUrl,
  }: Pick<AccountKey, 'serverUrl'>) {
    const temporary = makeMemoryAuthStorage();
    const client = yield* makeClient({ serverUrl, storage: temporary.storage });
    return { ...client, snapshot: temporary.snapshot };
  });
}

const synchronizeAccountFromSession = Effect.fnUntraced(function* (
  key: AccountKey,
  client: AuthClient['Service']
) {
  const repository = yield* AccountRepository;
  yield* client.sessionChanges.pipe(
    Stream.runForEach(
      Effect.fnUntraced(
        function* (session) {
          if (!AsyncResult.isSuccess(session) || Option.isNone(session.value)) {
            return;
          }
          const { user } = session.value.value;
          if (user.id !== key.userId) {
            return;
          }
          const account = yield* repository.findByKey(key);
          if (Option.isNone(account)) {
            return;
          }
          if (
            account.value.username === user.username &&
            account.value.name === user.name &&
            account.value.email === user.email &&
            account.value.role === user.role &&
            account.value.profilePicture === user.image
          ) {
            return;
          }
          yield* repository.updateProfile({
            key,
            profile: {
              username: user.username,
              name: user.name,
              email: user.email,
              role: user.role,
              profilePicture: user.image,
            },
          });
        },
        Effect.catchTags({
          AccountDatabaseError: (error) =>
            Effect.logError('Failed to synchronize account from session', error),
        })
      )
    ),
    Effect.forkScoped({ startImmediately: true })
  );
});

export class AuthClientMap extends Context.Service<AuthClientMap>()(
  'voel/domains/accounts/auth-client/AuthClientMap',
  {
    make: LayerMap.make(
      (key: AccountKey) =>
        AuthClient.layerNoDeps(key).pipe(
          Layer.tap((context) =>
            synchronizeAccountFromSession(key, Context.get(context, AuthClient))
          )
        ),
      { idleTimeToLive: '5 minutes' }
    ).pipe(
      Effect.map((map) => ({
        ...map,
        acquire: (key: AccountKey) =>
          map.contextEffect(key).pipe(Effect.map(Context.get(AuthClient))),
      }))
    ),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);
  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AccountRepository.layer, Reactivity.layer])
  );
}
