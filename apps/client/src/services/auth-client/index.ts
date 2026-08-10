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

import { betterAuthErrorFromUnknown } from '#src/services/auth-client/errors.ts';
import type { BetterAuthError } from '#src/services/auth-client/errors.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';

export const makeAuthStorageKey = ({
  serverUrl,
  authStorageId,
}: {
  readonly serverUrl: string;
  readonly authStorageId: string;
}) => `voel::auth::${serverUrl}::${authStorageId}`;

export class XxHash extends Context.Service<
  XxHash,
  { readonly hash128: (input: string) => Effect.Effect<string> }
>()('voel/services/auth-client/index/XxHash') {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const { hash128 } = yield* Effect.promise(async () => import('react-native-xxhash'));
      return Layer.succeed(XxHash, {
        hash128: (input) => Effect.sync(() => hash128(input)),
      });
    })
  );

  public static readonly layerTest = Layer.succeed(this, {
    hash128: (input) => Effect.succeed(`test-${input.replaceAll(':', '-')}`),
  });
}

export class BetterAuthClientInitializationError extends Schema.TaggedError<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  {
    error: Schema.Unknown,
  }
) {}

export interface AuthClientKeyFields {
  readonly serverUrl: string;
  readonly authStorageId: string;
}

export class AuthClientKey extends Data.Class<AuthClientKeyFields> {}

export const makeAuthClientKey = ({
  serverUrl,
  authStorageId,
}: AuthClientKeyFields): AuthClientKey => new AuthClientKey({ serverUrl, authStorageId });

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

export type VoelAuthClient = Effect.Success<ReturnType<typeof createVoelAuthClient>>;

const executeAuthClientRequest = Effect.fn('executeAuthClientRequest')(function* <A>(
  request: () => Promise<{
    readonly data: A | null;
    readonly error: unknown;
  }>
) {
  const result = yield* Effect.tryPromise({
    try: request,
    catch: betterAuthErrorFromUnknown,
  });

  if (result.error !== null) {
    return yield* betterAuthErrorFromUnknown(result.error);
  }

  if (result.data === null) {
    return yield* betterAuthErrorFromUnknown(new Error('Authentication response was empty.'));
  }

  return result.data;
});

type VoelAuthClientSessionState = ReturnType<VoelAuthClient['useSession']['get']>;

export interface AuthClientSessionState {
  readonly data: VoelAuthClientSessionState['data'];
  readonly error: BetterAuthError | null;
  readonly isPending: boolean;
  readonly isRefetching: boolean;
}

const authClientSessionState = (state: VoelAuthClientSessionState): AuthClientSessionState => ({
  data: state.data,
  error: state.error === null ? null : betterAuthErrorFromUnknown(state.error),
  isPending: state.isPending,
  isRefetching: state.isRefetching,
});

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/services/auth-client/index/AuthClient',
  {
    make: Effect.fn('AuthClient.make')(function* ({ serverUrl, authStorageId }: AuthClientKey) {
      const storage = yield* AuthClientStorage;
      const xxHash = yield* XxHash;

      const authClientStorage = {
        getItem: (key) => Effect.runSync(storage.getItem(key).pipe(Effect.map(Option.getOrNull))),
        setItem: (key, value) => {
          Effect.runSync(storage.setItem(key, value));
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
            Effect.runSync(SubscriptionRef.set(sessionState, authClientSessionState(state)));
          })
        ),
        (unsubscribe) => Effect.sync(unsubscribe)
      );

      const getCookie = Effect.fn('AuthClient.getCookie')(() =>
        Effect.sync(() => Option.liftPredicate(client.getCookie(), String.isNonEmpty))
      );

      const getSession = Effect.fn('AuthClient.getSession')(function* () {
        return yield* SubscriptionRef.get(sessionState);
      });

      const refreshSession = Effect.fn('AuthClient.refreshSession')(function* () {
        return yield* Effect.tryPromise({
          try: async () =>
            client.useSession.get().refetch({
              query: { disableCookieCache: true },
            }),
          catch: betterAuthErrorFromUnknown,
        });
      });

      const signOut = Effect.fn('AuthClient.signOut')(function* () {
        return yield* executeAuthClientRequest(async () => client.signOut());
      });

      const signInUsername = Effect.fn('AuthClient.signIn.username')(function* (
        input: Parameters<VoelAuthClient['signIn']['username']>[0]
      ) {
        return yield* executeAuthClientRequest(async () => client.signIn.username(input));
      });

      const signUpEmail = Effect.fn('AuthClient.signUp.email')(function* (
        input: Parameters<VoelAuthClient['signUp']['email']>[0]
      ) {
        return yield* executeAuthClientRequest(async () => client.signUp.email(input));
      });

      const updateUser = Effect.fn('AuthClient.updateUser')(function* (
        input: Parameters<VoelAuthClient['updateUser']>[0]
      ) {
        return yield* executeAuthClientRequest(async () => client.updateUser(input));
      });

      const listUsers = Effect.fn('AuthClient.admin.listUsers')(function* (
        input: Parameters<VoelAuthClient['admin']['listUsers']>[0]
      ) {
        return yield* executeAuthClientRequest(async () => client.admin.listUsers(input));
      });

      return {
        admin: { listUsers },
        getCookie,
        getSession,
        refreshSession,
        sessionChanges: SubscriptionRef.changes(sessionState),
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

export const acquireAuthClient = (key: AuthClientKeyFields) =>
  AuthClientMap.contextEffect(makeAuthClientKey(key)).pipe(Effect.map(Context.get(AuthClient)));

export class NoActiveAccountError extends Schema.TaggedError<
  NoActiveAccountError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/NoActiveAccountError')('NoActiveAccountError', {}) {}
