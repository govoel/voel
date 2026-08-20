import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { Context, Effect, Option, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { BetterAuthInstance } from '#src/server.ts';
import {
  AuthError,
  AuthSession,
  AuthTransportError,
  AuthUserResponse,
  BetterAuthApiError,
  InvalidAuthResponseError,
} from '#src/shared.ts';

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
      usernameClient({ displayUsername: false }),
      adminClient(),
      inferAdditionalFields<BetterAuthInstance>(),
    ] as const,
  });

class BetterAuthClientInitializationError extends Schema.TaggedError<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('@repo/auth-api/client/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  { error: Schema.Unknown }
) {}

const executeAuthClientRequest = Effect.fnUntraced(
  function* <A>(request: () => Promise<{ readonly data: A | null; readonly error: unknown }>) {
    const result = yield* Effect.tryPromise({
      try: request,
      catch: (cause) => AuthTransportError.make({ cause }),
    });

    if (result.error !== null) {
      return yield* Option.getOrElse(BetterAuthApiError.decodeUnknownOption(result.error), () =>
        InvalidAuthResponseError.make()
      );
    }

    if (result.data === null) {
      return yield* InvalidAuthResponseError.make();
    }

    return result.data;
  },
  (effect) => effect.pipe(Effect.mapError((reason) => AuthError.make({ reason })))
);

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
      AsyncResult.AsyncResult<Option.Option<AuthSession>, AuthError>
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
        SubscriptionRef.updateEffect(
          sessionState,
          Effect.fnUntraced(function* (previous) {
            const waiting = state.isPending || state.isRefetching;

            if (state.error !== null) {
              return AsyncResult.failWithPrevious(
                AuthError.make({
                  reason: Option.getOrElse(
                    BetterAuthApiError.decodeUnknownOption(state.error),
                    () => InvalidAuthResponseError.make()
                  ),
                }),
                { previous: Option.some(previous), waiting }
              );
            }

            if (waiting) {
              return AsyncResult.waitingFrom(Option.some(previous));
            }

            const session = Option.fromNullishOr(state.data);
            if (Option.isNone(session)) {
              return AsyncResult.success(Option.none());
            }

            return yield* AuthSession.decodeUnknownEffect(session.value).pipe(
              Effect.map((decodedSession) => AsyncResult.success(Option.some(decodedSession))),
              Effect.catchTags({
                SchemaError: () =>
                  Effect.succeed(
                    AsyncResult.failWithPrevious(
                      AuthError.make({ reason: InvalidAuthResponseError.make() }),
                      { previous: Option.some(previous), waiting }
                    )
                  ),
              })
            );
          })
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

      refreshSession: (
        input: Parameters<ReturnType<CoreAuthClient['useSession']['get']>['refetch']>['0']
      ) =>
        Effect.tryPromise({
          try: async () => client.useSession.get().refetch(input),
          catch: (cause) => AuthTransportError.make({ cause }),
        }),

      signIn: {
        username: (input: Parameters<CoreAuthClient['signIn']['username']>[0]) =>
          executeAuthClientRequest(async () => coreClient.signIn.username(input)).pipe(
            Effect.flatMap(AuthUserResponse.decodeUnknownEffect),
            Effect.catchTags({
              SchemaError: () => AuthError.make({ reason: InvalidAuthResponseError.make() }),
            })
          ),

        email: (input: Parameters<CoreAuthClient['signIn']['email']>[0]) =>
          executeAuthClientRequest(async () => coreClient.signIn.email(input)).pipe(
            Effect.flatMap(AuthUserResponse.decodeUnknownEffect),
            Effect.catchTags({
              SchemaError: () => AuthError.make({ reason: InvalidAuthResponseError.make() }),
            })
          ),
      },

      signOut: (input?: Parameters<CoreAuthClient['signOut']>[0]) =>
        executeAuthClientRequest(async () => coreClient.signOut(input)),

      signUp: {
        email: (input: Parameters<CoreAuthClient['signUp']['email']>[0]) =>
          executeAuthClientRequest(async () => coreClient.signUp.email(input)).pipe(
            Effect.flatMap(AuthUserResponse.decodeUnknownEffect),
            Effect.catchTags({
              SchemaError: () => AuthError.make({ reason: InvalidAuthResponseError.make() }),
            })
          ),
      },

      updateUser: (input: Parameters<CoreAuthClient['updateUser']>[0]) =>
        executeAuthClientRequest(async () => coreClient.updateUser(input)),
    };
  }),
}) {}
