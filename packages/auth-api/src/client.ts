import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { Context, Effect, Option, Predicate, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import * as AuthClientSchema from '#src/auth-client-schema.ts';
import { authRoles } from '#src/roles.ts';
import type { BetterAuthInstance } from '#src/server.ts';
import {
  AuthAdminRevokeSessionInput,
  AuthAdminUpdateUserInput,
  AuthAdminUserDetails,
  AuthAdminUserResponse,
  AuthChangePasswordInput,
  AuthCreateUserInput,
  AuthDeviceSession,
  AuthError,
  AuthListUsersInput,
  AuthRevokeSessionInput,
  AuthSession,
  AuthSetRoleInput,
  AuthSetUserPasswordInput,
  AuthSignInInput,
  AuthSignUpInput,
  AuthTransportError,
  AuthUpdateUserInput,
  AuthUserIdInput,
  AuthUserResponse,
  AuthUserSessions,
  AuthUsersPage,
  BetterAuthApiError,
  InvalidAuthResponseError,
} from '#src/shared.ts';

const createAuthClient = <const Plugins extends ReadonlyArray<BetterAuthClientPlugin>>({
  baseURL,
  fetchOptions,
  plugins,
  sessionOptions,
}: Pick<BetterAuthClientOptions, 'baseURL' | 'fetchOptions' | 'sessionOptions'> & {
  readonly plugins: Plugins;
}) =>
  createBetterAuthClient({
    baseURL,
    basePath: '/api/auth',
    fetchOptions,
    sessionOptions,
    plugins: [
      ...plugins,
      usernameClient({ displayUsername: false }),
      adminClient({ roles: authRoles }),
      inferAdditionalFields<BetterAuthInstance>(),
    ] as const,
  });

export class BetterAuthClientInitializationError extends Schema.TaggedError<
  BetterAuthClientInitializationError,
  { readonly brand: unique symbol }
>('@repo/auth-api/client/BetterAuthClientInitializationError')(
  'BetterAuthClientInitializationError',
  { error: Schema.Unknown }
) {}

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
      AsyncResult.AsyncResult<Option.Option<typeof AuthSession.Type>, AuthError>
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
        revokeUserSession: AuthClientSchema.request({
          Request: AuthAdminRevokeSessionInput,
          execute: async ({ request, signal }) =>
            coreClient.admin.revokeUserSession(request, { signal }),
          Result: Schema.Void,
        }),

        revokeUserSessions: AuthClientSchema.request({
          Request: AuthUserIdInput,
          execute: async ({ request, signal }) =>
            coreClient.admin.revokeUserSessions(request, { signal }),
          Result: Schema.Void,
        }),

        listUserSessions: AuthClientSchema.request({
          Request: AuthUserIdInput,
          execute: async ({ request, signal }) =>
            coreClient.admin.listUserSessions(request, { signal }),
          Result: AuthUserSessions,
        }),

        removeUser: AuthClientSchema.request({
          Request: AuthUserIdInput,
          execute: async ({ request, signal }) => coreClient.admin.removeUser(request, { signal }),
          Result: Schema.Void,
        }),

        setUserPassword: AuthClientSchema.request({
          Request: AuthSetUserPasswordInput,
          execute: async ({ request, signal }) =>
            coreClient.admin.setUserPassword(request, { signal }),
          Result: Schema.Void,
        }),

        updateUser: AuthClientSchema.request({
          Request: AuthAdminUpdateUserInput,
          execute: async ({ request: { userId, username, ...data }, signal }) => {
            const current = await coreClient.admin.getUser({ query: { id: userId } }, { signal });
            signal.throwIfAborted();
            if (current.error !== null) {
              return current;
            }
            // Better Auth's username hook checks the acting admin rather than the target.
            // Only send a username when it changes, including on retries of the same update.
            return coreClient.admin.updateUser(
              {
                userId,
                data: {
                  ...data,
                  ...(Predicate.hasProperty(current.data, 'username') &&
                  current.data.username === username.toLowerCase()
                    ? {}
                    : { username }),
                },
              },
              { signal }
            );
          },
          Result: AuthAdminUserDetails,
        }),

        getUser: AuthClientSchema.request({
          Request: AuthUserIdInput,
          execute: async ({ request: { userId }, signal }) =>
            coreClient.admin.getUser({ query: { id: userId } }, { signal }),
          Result: AuthAdminUserDetails,
        }),

        createUser: AuthClientSchema.request({
          Request: AuthCreateUserInput,
          execute: async ({ request: { username, ...user }, signal }) =>
            coreClient.admin.createUser(
              {
                ...user,
                data: { username },
              },
              { signal }
            ),
          Result: AuthAdminUserResponse,
        }),

        listUsers: AuthClientSchema.request({
          Request: AuthListUsersInput,
          execute: async ({ request: query, signal }) =>
            coreClient.admin.listUsers({ query }, { signal }),
          Result: AuthUsersPage,
        }),

        setRole: AuthClientSchema.request({
          Request: AuthSetRoleInput,
          execute: async ({ request, signal }) => coreClient.admin.setRole(request, { signal }),
          Result: AuthAdminUserResponse,
        }),
      },

      revokeSession: AuthClientSchema.request({
        Request: AuthRevokeSessionInput,
        execute: async ({ request, signal }) => coreClient.revokeSession(request, { signal }),
        Result: Schema.Void,
      }),

      revokeSessions: AuthClientSchema.request({
        Request: Schema.Void,
        execute: async ({ signal }) => coreClient.revokeSessions({ fetchOptions: { signal } }),
        Result: Schema.Void,
      })(),

      listSessions: AuthClientSchema.request({
        Request: Schema.Void,
        execute: async ({ signal }) => coreClient.listSessions({ fetchOptions: { signal } }),
        Result: Schema.Array(AuthDeviceSession),
      })(),

      readSession: AuthClientSchema.request({
        Request: Schema.Void,
        execute: async ({ signal }) =>
          coreClient.getSession({ query: { disableCookieCache: true } }, { signal }),
        Result: AuthSession,
      })(),

      getSession: SubscriptionRef.get(sessionState),

      refreshSession: (
        input: Parameters<ReturnType<CoreAuthClient['useSession']['get']>['refetch']>['0']
      ) =>
        Effect.tryPromise({
          try: async () => client.useSession.get().refetch(input),
          catch: (cause) => AuthTransportError.make({ cause }),
        }),

      signIn: {
        username: AuthClientSchema.request({
          Request: AuthSignInInput,
          execute: async ({ request, signal }) => coreClient.signIn.username(request, { signal }),
          Result: AuthUserResponse,
        }),
      },

      signOut: AuthClientSchema.request({
        Request: Schema.Void,
        execute: async ({ signal }) => coreClient.signOut({ fetchOptions: { signal } }),
        Result: Schema.Void,
      })(),

      signUp: {
        email: AuthClientSchema.request({
          Request: AuthSignUpInput,
          execute: async ({ request, signal }) => coreClient.signUp.email(request, { signal }),
          Result: AuthUserResponse,
        }),
      },

      changePassword: AuthClientSchema.request({
        Request: AuthChangePasswordInput,
        execute: async ({ request, signal }) => coreClient.changePassword(request, { signal }),
        Result: Schema.Void,
      }),

      updateUser: AuthClientSchema.request({
        Request: AuthUpdateUserInput,
        execute: async ({ request, signal }) => coreClient.updateUser(request, { signal }),
        Result: Schema.Void,
      }),
    };
  }),
}) {}
