import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { Context, Effect, Option, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { BetterAuthInstance } from '#src/server.ts';
import { AuthSession, UnexpectedAuthSessionError } from '#src/shared.ts';

const createAuthClient = <const Plugins extends ReadonlyArray<BetterAuthClientPlugin>>({
  baseURL,
  plugins,
  sessionOptions,
}: Pick<BetterAuthClientOptions, 'baseURL' | 'sessionOptions'> & {
  readonly plugins: Plugins;
}) =>
  createBetterAuthClient({
    baseURL,
    basePath: '/api/auth',
    sessionOptions,
    plugins: [
      ...plugins,
      usernameClient(),
      adminClient(),
      inferAdditionalFields<BetterAuthInstance>(),
    ] as const,
  });

class BetterAuthClientInitializationError extends Schema.TaggedError<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  { error: Schema.Unknown }
) {}

const UnknownBetterAuthErrorFields = {
  code: 'UNKNOWN',
  status: 0,
  statusText: 'UNKNOWN',
} as const;

export class BetterAuthError extends Schema.Error<
  BetterAuthError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/errors/BetterAuthError')({
  _tag: Schema.tagDefaultOmit('BetterAuthError'),
  code: Schema.String.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(UnknownBetterAuthErrorFields.code))
  ),
  message: Schema.optional(Schema.String),
  status: Schema.Finite.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(UnknownBetterAuthErrorFields.status))
  ),
  statusText: Schema.String.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(UnknownBetterAuthErrorFields.statusText))
  ),
}) {
  public static readonly decodeFromUnknown = this.pipe(
    Schema.catchDecoding(() =>
      Effect.succeed(Option.some(BetterAuthError.make(UnknownBetterAuthErrorFields)))
    ),
    Schema.decodeUnknownSync
  );
}

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

const authClientSessionState = Effect.fnUntraced(function* (
  state: ReturnType<ReturnType<typeof createAuthClient<[]>>['useSession']['get']>,
  previous: Option.Option<
    AsyncResult.AsyncResult<
      Option.Option<AuthSession>,
      BetterAuthError | UnexpectedAuthSessionError
    >
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

  return yield* AuthSession.decodeFromUnknownEffect(session.value).pipe(
    Effect.map((decodedSession) => AsyncResult.success(Option.some(decodedSession))),
    Effect.catchTags({
      SchemaError: () =>
        Effect.succeed(
          AsyncResult.failWithPrevious(UnexpectedAuthSessionError.make(), {
            previous,
            waiting,
          })
        ),
    })
  );
});

type CoreAuthClient = ReturnType<typeof createAuthClient<[]>>;

export class AuthClient extends Context.Service<AuthClient>()('@repo/auth-api/client/AuthClient', {
  make: Effect.fnUntraced(function* <const Plugins extends ReadonlyArray<BetterAuthClientPlugin>>(
    config: Parameters<typeof createAuthClient<Plugins>>[0]
  ) {
    const client = yield* Effect.try({
      try: () => createAuthClient<Plugins>(config),
      catch: (error) => BetterAuthClientInitializationError.make({ error }),
    });

    // Built-in plugins are appended after caller plugins, so their actions
    // always win at runtime even though Better Auth cannot prove that for an
    // unresolved generic plugin tuple.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const coreClient = client as typeof client & CoreAuthClient;

    const sessionState = yield* SubscriptionRef.make<
      Effect.Success<ReturnType<typeof authClientSessionState>>
    >(AsyncResult.initial(true));

    yield* Stream.callback<ReturnType<typeof client.useSession.get>>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          Queue.offerUnsafe(queue, client.useSession.get());

          return client.useSession.listen((state) => {
            Queue.offerUnsafe(queue, state);
          });
        }),
        (unsubscribe) => Effect.sync(unsubscribe)
      )
    ).pipe(
      Stream.mapEffect((state) =>
        SubscriptionRef.updateEffect(sessionState, (previous) =>
          authClientSessionState(state, Option.some(previous))
        )
      ),
      Stream.runDrain,
      Effect.forkScoped
    );

    return {
      rawClient: client,

      sessionChanges: SubscriptionRef.changes(sessionState),

      admin: {
        createUser: (input: Parameters<CoreAuthClient['admin']['createUser']>[0]) =>
          executeAuthClientRequest(async () => coreClient.admin.createUser(input)),

        listUsers: (input: Parameters<CoreAuthClient['admin']['listUsers']>[0]) =>
          executeAuthClientRequest(async () => coreClient.admin.listUsers(input)),

        setRole: (input: Parameters<CoreAuthClient['admin']['setRole']>[0]) =>
          executeAuthClientRequest(async () => coreClient.admin.setRole(input)),
      },

      getSession: SubscriptionRef.get(sessionState),

      refreshSession: Effect.tryPromise({
        try: async () =>
          client.useSession.get().refetch({
            query: { disableCookieCache: true },
          }),
        catch: BetterAuthError.decodeFromUnknown,
      }),

      signIn: {
        username: (input: Parameters<CoreAuthClient['signIn']['username']>[0]) =>
          executeAuthClientRequest(async () => coreClient.signIn.username(input)),

        email: (input: Parameters<CoreAuthClient['signIn']['email']>[0]) =>
          executeAuthClientRequest(async () => coreClient.signIn.email(input)),
      },

      signOut: executeAuthClientRequest(async () => coreClient.signOut()),

      signUp: {
        email: (input: Parameters<CoreAuthClient['signUp']['email']>[0]) =>
          executeAuthClientRequest(async () => coreClient.signUp.email(input)),
      },

      updateUser: (input: Parameters<CoreAuthClient['updateUser']>[0]) =>
        executeAuthClientRequest(async () => coreClient.updateUser(input)),
    };
  }),
}) {}
