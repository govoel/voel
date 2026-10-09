import { EmailDelivery, Password } from '@yielded/auth';
import { layer as kdfAdmissionLayer } from '@yielded/crypto/KdfAdmission';
import { layer as bunCryptoLayer } from '@yielded/crypto/platform-bun';
import { layerCryptoWeb } from '@yielded/crypto/WebCrypto';
import { Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/sql';

import type { makeAppAuth } from '#src/services/auth/app.ts';
import { makeAuthPersistence } from '#src/services/auth/persistence.ts';

// One shared admission scope bounds maintained hashing and the native Argon2 backend.
// Admission is concurrency control, not registration request-rate limiting.
const crypto = bunCryptoLayer().pipe(
  Layer.provideMerge(kdfAdmissionLayer()),
  Layer.merge(layerCryptoWeb)
);
const passwords = Layer.mergeAll(
  Password.PasswordHashing.layer(),
  Password.NewPasswordCheck.layer(),
  Password.PasswordAttemptLimiter.layer
);

// These mandatory capabilities are disabled, not alternative security flows.
// Add/change/reset are absent from the public action whitelist.
const disabledManagement = Layer.mergeAll(
  Layer.succeed(Password.PasswordActionEvidence, {
    verify: () => Effect.fail(Password.PasswordActionRequired.make({})),
  }),
  Layer.succeed(EmailDelivery.EmailDelivery, {
    send: () => Effect.fail(EmailDelivery.EmailNotAccepted.make({})),
  })
);

const claims = ({ auth }: { readonly auth: ReturnType<typeof makeAppAuth> }) =>
  Layer.effect(
    auth.strategies.password.SessionClaims,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return {
        resolve: Effect.fn('Auth.resolveClaims')(
          function* ({ subjectId, credential }) {
            const [account] = yield* sql`
              select
                display_name as "displayName",
                role
              from
                accounts
              where
                id = ${subjectId}
                and active = 1
            `.pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  Schema.Tuple([
                    Schema.Struct({
                      displayName: auth.claims.fields.displayName,
                      role: auth.claims.fields.role,
                    }),
                  ])
                )
              )
            );
            // Email comes from the maintained credential, never request claims.
            return yield* Schema.decodeEffect(auth.claims)({
              ...account,
              email: credential.identifier.value,
            });
          },
          Effect.catchTags({
            SchemaError: () => Effect.fail(Password.PasswordUnavailable.make({})),
            SqlError: () => Effect.fail(Password.PasswordUnavailable.make({})),
          })
        ),
      } satisfies typeof auth.strategies.password.SessionClaims.Service;
    })
  );

/** Scoped, opt-in composition; the live Better Auth runtime is not replaced.
 * CompromisedPasswords is REQUIRED: consumers supply a real fail-closed screening
 * service. Registration has no built-in sign-in/change attempt bucket; the default
 * login limiter is runtime-local, not distributed. */
export const YieldedAuthLive = {
  layer: ({
    auth,
    filename,
  }: {
    readonly auth: ReturnType<typeof makeAppAuth>;
    readonly filename: string;
  }) => {
    // Crypto must reach persistence's lazy construction environment directly.
    const storage = makeAuthPersistence({ auth })
      .layer({ filename })
      .pipe(Layer.provideMerge(crypto));
    const services = Layer.mergeAll(claims({ auth }), passwords, disabledManagement).pipe(
      Layer.provideMerge(storage)
    );
    return auth.layer.pipe(Layer.provideMerge(services));
  },
};
