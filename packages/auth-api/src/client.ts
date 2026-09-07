import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client';
import { createAuthClient as createBetterAuthClient } from 'better-auth/client';
import { adminClient, inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { Context, Effect, Option, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';

import { authRoles } from '#src/roles.ts';
import type { BetterAuthInstance } from '#src/server.ts';
import type { AuthUser } from '#src/shared.ts';
import {
  AuthAdminUserResponse,
  AuthCreateUserInput,
  AuthError,
  AuthListUsersInput,
  AuthSession,
  AuthSetRoleInput,
  AuthSignInInput,
  AuthSignUpInput,
  AuthTransportError,
  AuthUpdateUserInput,
  AuthUserResponse,
  AuthUsersPage,
  BetterAuthApiError,
  InvalidAuthInputError,
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
      adminClient({ roles: authRoles }),
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
  function* <Response extends Schema.Constraint>({
    request,
    response,
  }: {
    readonly request: () => Promise<{ readonly data: unknown; readonly error: unknown }>;
    readonly response: Response;
  }) {
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

    // oxlint-disable-next-line effecttsgo/prefer-typed-schema-decoder -- The generic constraint has unknown Encoded; the actual transport payload is untrusted.
    return yield* Schema.decodeUnknownEffect(response)(result.data).pipe(
      Effect.catchTag('SchemaError', () => InvalidAuthResponseError.make())
    );
  },
  Effect.catchTags({
    AuthTransportError: (reason) => AuthError.make({ reason }),
    BetterAuthApiError: (reason) => AuthError.make({ reason }),
    InvalidAuthResponseError: (reason) => AuthError.make({ reason }),
  })
);

// Validate commands before transport and responses before exposing domain values.
const executeAuthClientCommand = Effect.fnUntraced(function* <
  Input extends Schema.Constraint,
  Response extends Schema.Constraint,
>({
  input,
  schema,
  request,
  response,
}: {
  readonly input: Input['Encoded'];
  readonly schema: Input;
  readonly request: (
    input: Input['Type']
  ) => Promise<{ readonly data: unknown; readonly error: unknown }>;
  readonly response: Response;
}) {
  const command = yield* Schema.decodeEffect(schema, { onExcessProperty: 'error' })(input).pipe(
    Effect.catchTag('SchemaError', () => AuthError.make({ reason: InvalidAuthInputError.make() }))
  );
  return yield* executeAuthClientRequest({ request: async () => request(command), response });
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
        createUser: (input: typeof AuthCreateUserInput.Encoded & Pick<AuthUser, 'role'>) =>
          executeAuthClientCommand({
            input,
            schema: AuthCreateUserInput,
            request: async ({ username, ...user }) =>
              coreClient.admin.createUser({
                ...user,
                data: { username },
              }),
            response: AuthAdminUserResponse,
          }),

        listUsers: (input: typeof AuthListUsersInput.Encoded) =>
          executeAuthClientCommand({
            input,
            schema: AuthListUsersInput,
            request: async (query) => coreClient.admin.listUsers({ query }),
            response: AuthUsersPage,
          }),

        setRole: (input: Pick<AuthSetRoleInput, 'userId' | 'role'>) =>
          executeAuthClientCommand({
            input,
            schema: AuthSetRoleInput,
            request: async (command) => coreClient.admin.setRole(command),
            response: AuthAdminUserResponse,
          }),
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
        username: (input: typeof AuthSignInInput.Encoded) =>
          executeAuthClientCommand({
            input,
            schema: AuthSignInInput,
            request: async (command) => coreClient.signIn.username(command),
            response: AuthUserResponse,
          }),
      },

      signOut: executeAuthClientRequest({
        request: async () => coreClient.signOut(),
        response: Schema.Struct({ success: Schema.Literal(true) }),
      }).pipe(Effect.asVoid),

      signUp: {
        email: (input: typeof AuthSignUpInput.Encoded) =>
          executeAuthClientCommand({
            input,
            schema: AuthSignUpInput,
            request: async (command) => coreClient.signUp.email(command),
            response: AuthUserResponse,
          }),
      },

      updateUser: (input: typeof AuthUpdateUserInput.Encoded) =>
        executeAuthClientCommand({
          input,
          schema: AuthUpdateUserInput,
          request: async (command) => coreClient.updateUser(command),
          response: Schema.Struct({ status: Schema.Literal(true) }),
        }).pipe(Effect.asVoid),
    };
  }),
}) {}
