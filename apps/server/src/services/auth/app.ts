import { Auth, Operations, Sessions } from '@yielded/auth';
import { Context, Effect, Layer } from 'effect';

import { AuthApi } from '@repo/spec-api/auth/contract.ts';

const signIn = AuthApi.actions.passwordSignIn.route.operation;
const bootstrap = AuthApi.actions.bootstrapServer.route.operation;

const SignIn = Operations.makeOperation(`${AuthApi.namespace}/account/signIn`, {
  payload: signIn.rpc.payloadSchema,
  success: signIn.rpc.successSchema,
  error: signIn.rpc.errorSchema,
  access: 'any',
  exposure: 'public',
  replay: signIn.replay,
  credentials: true,
});

const BootstrapServer = Operations.makeOperation(`${AuthApi.namespace}/account/bootstrapServer`, {
  payload: bootstrap.rpc.payloadSchema,
  success: bootstrap.rpc.successSchema,
  error: bootstrap.rpc.errorSchema,
  access: 'any',
  exposure: 'public',
  replay: bootstrap.replay,
});

/** Application-owned workflows. Setup is open only when ALL users count = 0;
 * future bootstrap must atomically check that count and create the admin.
 * Sign-in must complete through the session authority. */
export class AccountMethods extends Context.Service<
  AccountMethods,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- runtime implementations provide this contract
  {
    readonly signIn: (
      input: typeof SignIn.rpc.payloadSchema.Type
    ) => Effect.Effect<
      Operations.AuthOperationResult<typeof SignIn.rpc.successSchema.Type>,
      typeof SignIn.rpc.errorSchema.Type
    >;
    readonly bootstrapServer: (
      input: typeof BootstrapServer.rpc.payloadSchema.Type
    ) => Effect.Effect<
      typeof BootstrapServer.rpc.successSchema.Type,
      typeof BootstrapServer.rpc.errorSchema.Type
    >;
  }
>()('@repo/server/services/auth/app/AccountMethods') {}

const AccountStrategy = Auth.makeStrategy(
  { signIn: SignIn.invoke, bootstrapServer: BootstrapServer.invoke },
  Layer.merge(
    SignIn.credentialHandlerLayer(
      Effect.fn('Account.signIn')(function* (input) {
        return yield* (yield* AccountMethods).signIn(input);
      })
    ),
    BootstrapServer.handlerLayer(
      Effect.fn('Account.bootstrapServer')(function* (input) {
        return yield* (yield* AccountMethods).bootstrapServer(input);
      })
    )
  ),
  { completion: true }
);

// Composed persistence inspects installed module metadata, not operation names.
// This is password storage for our custom workflows, not a second public strategy.
const AccountModule = {
  strategy: AccountStrategy,
  persistence: {
    kind: 'password' as const,
    moduleId: `${AuthApi.namespace}/account` as const,
    management: false as const,
  },
};

interface AccountDefinition extends Auth.StrategyTypeLambda {
  readonly type: typeof AccountModule;
}

const account: Auth.StrategyDefinition<
  AccountDefinition,
  typeof AccountModule.persistence.moduleId
> = {
  namespace: AccountModule.persistence.moduleId,
  bind: () => AccountModule,
};

/** Server-only definition. Persistence and AccountMethods are supplied when
 * building AppAuth.layer; the existing Better Auth routes are not replaced yet. */
export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful(),
  strategies: { account },
});
