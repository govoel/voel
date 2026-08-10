import { expoClient } from '@better-auth/expo/client';
import {
  Context,
  Data,
  Duration,
  Effect,
  Layer,
  LayerMap,
  Option,
  Schema,
  String,
  SubscriptionRef,
} from 'effect';

import { createAuthClient } from '@repo/auth-api/client.ts';

import { BetterAuthError } from '#src/services/auth-client/errors.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';

export const makeAuthStorageKey = ({
  serverUrl,
  authStorageId,
}: {
  serverUrl: AuthClientKey['serverUrl'];
  authStorageId: AuthClientKey['authStorageId'];
}) => `voel::auth::${serverUrl}::${authStorageId}`;

class BetterAuthClientInitializationError extends Schema.TaggedError<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  {
    error: Schema.Unknown,
  }
) {}

class AuthClientKey extends Data.Class<{
  readonly serverUrl: string;
  readonly authStorageId: string;
}> {}

export const createVoelAuthClient = Effect.fnUntraced(function* ({
  serverUrl,
  authStorageId,
  storage,
  xxHash,
}: {
  readonly serverUrl: NonNullable<Parameters<typeof createAuthClient>[0]['baseURL']>;
  readonly authStorageId: string;
  readonly storage: Parameters<typeof expoClient>[0]['storage'];
  readonly xxHash: XxHash['Service'];
}) {
  const storagePrefix = yield* xxHash.hash128(makeAuthStorageKey({ serverUrl, authStorageId }));

  return yield* Effect.try({
    try: () =>
      createAuthClient({
        baseURL: serverUrl,
        plugins: [
          expoClient({
            storage,
            storagePrefix,
            cookiePrefix: 'auth',
          }),
        ],
        sessionOptions: {
          refetchInterval: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
        },
      }),
    catch: (error) => new BetterAuthClientInitializationError({ error }),
  });
});

type VoelAuthClient = Effect.Success<ReturnType<typeof createVoelAuthClient>>;

const executeAuthClientRequest = Effect.fnUntraced(function* <A>(
  request: () => Promise<{
    readonly data: A | null;
    readonly error: unknown;
  }>
) {
  const result = yield* Effect.tryPromise({
    try: request,
    catch: BetterAuthError.decodeFromUnknown,
  });

  if (result.error !== null) {
    return yield* BetterAuthError.decodeFromUnknown(result.error);
  }

  if (result.data === null) {
    return yield* BetterAuthError.decodeFromUnknown(
      new Error('Authentication response was empty.')
    );
  }

  return result.data;
});

export interface AuthClientSessionState {
  readonly data: ReturnType<VoelAuthClient['useSession']['get']>['data'];
  readonly error: BetterAuthError | null;
  readonly isPending: boolean;
  readonly isRefetching: boolean;
}

const authClientSessionState = (
  state: ReturnType<VoelAuthClient['useSession']['get']>
): AuthClientSessionState => ({
  data: state.data,
  error: state.error === null ? null : BetterAuthError.decodeFromUnknown(state.error),
  isPending: state.isPending,
  isRefetching: state.isRefetching,
});

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/services/auth-client/index/AuthClient',
  {
    make: Effect.fnUntraced(function* ({ serverUrl, authStorageId }: AuthClientKey) {
      const runSync = Effect.runSyncWith(yield* Effect.context());
      const storage = yield* AuthClientStorage;
      const xxHash = yield* XxHash;

      const authClientStorage = {
        getItem: (key) => runSync(storage.getItem(key).pipe(Effect.map(Option.getOrNull))),
        setItem: (key, value) => {
          runSync(storage.setItem(key, value));
        },
      } satisfies Parameters<typeof createVoelAuthClient>[0]['storage'];

      const client = yield* createVoelAuthClient({
        serverUrl,
        authStorageId,
        storage: authClientStorage,
        xxHash,
      });

      const sessionState = yield* SubscriptionRef.make(
        authClientSessionState(client.useSession.get())
      );

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.useSession.subscribe((state) => {
            runSync(SubscriptionRef.set(sessionState, authClientSessionState(state)));
          })
        ),
        (unsubscribe) => Effect.sync(unsubscribe)
      );

      const getCookie = () =>
        Effect.sync(() => Option.liftPredicate(client.getCookie(), String.isNonEmpty));

      const getSession = () => SubscriptionRef.get(sessionState);

      const refreshSession = () =>
        Effect.tryPromise({
          try: async () =>
            client.useSession.get().refetch({
              query: { disableCookieCache: true },
            }),
          catch: BetterAuthError.decodeFromUnknown,
        });

      const signOut = () => executeAuthClientRequest(async () => client.signOut());

      const signInUsername = (input: Parameters<VoelAuthClient['signIn']['username']>[0]) =>
        executeAuthClientRequest(async () => client.signIn.username(input));

      const signUpEmail = (input: Parameters<VoelAuthClient['signUp']['email']>[0]) =>
        executeAuthClientRequest(async () => client.signUp.email(input));

      const updateUser = (input: Parameters<VoelAuthClient['updateUser']>[0]) =>
        executeAuthClientRequest(async () => client.updateUser(input));

      const listUsers = (input: Parameters<VoelAuthClient['admin']['listUsers']>[0]) =>
        executeAuthClientRequest(async () => client.admin.listUsers(input));

      return {
        sessionChanges: SubscriptionRef.changes(sessionState),

        admin: { listUsers },
        getCookie,
        getSession,
        refreshSession,
        signIn: { username: signInUsername },
        signOut,
        signUp: { email: signUpEmail },
        updateUser,
      };
    }),
  }
) {
  public static readonly layer = (key: AuthClientKey) => Layer.effect(this, this.make(key));
}

export class AuthClientMap extends LayerMap.Service<AuthClientMap>()(
  'voel/services/auth-client/index/AuthClientMap',
  {
    lookup: AuthClient.layer,
  }
) {}

export const acquireAuthClient = (key: {
  authStorageId: AuthClientKey['authStorageId'];
  serverUrl: AuthClientKey['serverUrl'];
}) => AuthClientMap.contextEffect(new AuthClientKey(key)).pipe(Effect.map(Context.get(AuthClient)));

export class NoActiveAccountError extends Schema.TaggedError<
  NoActiveAccountError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/NoActiveAccountError')('NoActiveAccountError', {}) {}
