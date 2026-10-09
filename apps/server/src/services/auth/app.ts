import { Auth, Password, Sessions } from '@yielded/auth';

import { AuthApi } from '@repo/spec-api/auth/contract.ts';

/** Opt-in server definition; the existing Better Auth runtime remains active. */
export const makeAppAuth = ({ resetUrl }: { readonly resetUrl: string }) =>
  Auth.make(AuthApi, {
    sessions: Sessions.stateful(),
    strategies: {
      password: Password.make({
        registration:
          AuthApi.actions.bootstrapServer.route.operation.rpc.payloadSchema.fields.registration,
        // beta.30 requires a real HTTPS landing URL even with delivery disabled.
        // The maintained layer validates it at acquisition; no production default.
        reset: Password.resetLink({ url: resetUrl }),
      }),
    },
  });
