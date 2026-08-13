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
  SchemaGetter,
  Stream,
  String,
  SubscriptionRef,
} from 'effect';
import { AsyncResult, Reactivity } from 'effect/unstable/reactivity';

import { createAuthClient } from '@repo/auth-api/client.ts';
import type { Selectable } from '@repo/effect-kysely';

import { BetterAuthError } from '#src/services/auth-client/errors.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account, AccountRole } from '#src/services/database/main/schema.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

export const makeAuthStorageKey = ({
  serverUrl,
  authStorageId,
}: {
  readonly serverUrl: string;
  readonly authStorageId: string;
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

class AuthClientKey extends Data.Class<
  Pick<Selectable<AccountTable>, 'serverUrl' | 'authStorageId'>
> {}

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

class AuthClientSession extends Schema.Class<AuthClientSession, { readonly brand: unique symbol }>(
  'voel/services/auth-client/index/AuthClientSession'
)({
  user: Schema.Struct({
    email: Account.fields.email,
    id: Account.fields.userId,
    image: Account.fields.profilePicture,
    name: Account.fields.name,
    role: Schema.String.pipe(
      Schema.decodeTo(Account.fields.role, {
        decode: SchemaGetter.transform((role) =>
          AccountRole.isValue(role) ? role : ('under18' as const)
        ),
        encode: SchemaGetter.transform((role) => role),
      })
    ),
    username: Account.fields.username,
  }),
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

const authClientSessionState = Effect.fnUntraced(function* (
  state: ReturnType<VoelAuthClient['useSession']['get']>,
  previous: Option.Option<
    AsyncResult.AsyncResult<Option.Option<AuthClientSession>, BetterAuthError | Schema.SchemaError>
  >
) {
  const waiting = state.isPending || state.isRefetching;

  if (state.error !== null) {
    return AsyncResult.failWithPrevious(BetterAuthError.decodeFromUnknown(state.error), {
      previous,
      waiting,
    });
  }

  if (waiting) {
    return AsyncResult.waitingFrom(previous);
  }

  const session = Option.fromNullishOr(state.data);
  if (Option.isNone(session)) {
    return AsyncResult.success(Option.none());
  }

  return yield* AuthClientSession.decodeUnknownEffect(session.value).pipe(
    Effect.map((decodedSession) => AsyncResult.success(Option.some(decodedSession))),
    Effect.catch((error) =>
      Effect.succeed(AsyncResult.failWithPrevious(error, { previous, waiting }))
    )
  );
});

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/services/auth-client/AuthClient',
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

      const sessionState = yield* SubscriptionRef.make<
        Effect.Success<ReturnType<typeof authClientSessionState>>
      >(AsyncResult.initial(true));

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          client.useSession.subscribe((state) => {
            runSync(
              SubscriptionRef.updateEffect(sessionState, (previous) =>
                authClientSessionState(state, Option.some(previous))
              )
            );
          })
        ),
        (unsubscribe) => Effect.sync(unsubscribe)
      );

      const getCookie = Effect.sync(() =>
        Option.liftPredicate(client.getCookie(), String.isNonEmpty)
      );

      const getSession = SubscriptionRef.get(sessionState);

      const refreshSession = Effect.tryPromise({
        try: async () =>
          client.useSession.get().refetch({
            query: { disableCookieCache: true },
          }),
        catch: BetterAuthError.decodeFromUnknown,
      });

      const signOut = executeAuthClientRequest(async () => client.signOut());

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
          const userId = Account.fields.userId.make(user.id);
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
            account.value.username === user.username &&
            account.value.name === user.name &&
            account.value.email === user.email &&
            account.value.role === user.role &&
            account.value.profilePicture === user.image
          ) {
            return;
          }

          yield* db
            .executeTakeFirstOption(
              db
                .updateTable('account')
                .set({
                  username: user.username,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  profilePicture: user.image,
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
    lookup: (key: AuthClientKey) =>
      AuthClient.layer(key).pipe(
        Layer.tap((context) => synchronizeAccountFromSession(key, Context.get(context, AuthClient)))
      ),
  }
) {}

export const acquireAuthClient = (key: {
  readonly authStorageId: AuthClientKey['authStorageId'];
  readonly serverUrl: AuthClientKey['serverUrl'];
}) => AuthClientMap.contextEffect(new AuthClientKey(key)).pipe(Effect.map(Context.get(AuthClient)));
