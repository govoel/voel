import { Schema as AuthSchema, Password, Sessions } from '@yielded/auth';
import { AuthPersistence } from '@yielded/auth-persistence';
import { Crypto, Duration, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/sql';

import { SqliteMigrator, TursoClient } from '@repo/effect-turso';

import type { makeAppAuth } from '#src/services/auth/app.ts';
import storageMigration from '#src/services/auth/migrations/000001-storage.ts';
import { AuthTables } from '#src/services/auth/tables.ts';

const { subjects, ...tables } = AuthTables;
const passwordRequirement = Sessions.AuthenticationRequirement.make({
  alternatives: [
    {
      factors: ['knowledge'],
      userVerified: false,
      phishingResistant: false,
      minimumCredentials: 1,
    },
  ],
  maximumAgeMillis: Duration.toMillis(Duration.minutes(5)),
});

export const YieldedAuthMigrations = {
  options: {
    loader: SqliteMigrator.fromRecord({ '000001_storage': storageMigration }),
  },
};

/** Composable maintained persistence, with no transport or Better Auth cutover.
 * Use a fresh private auth database, never a synced library database. Every physical
 * connection enables FK enforcement before entering the Turso pool. Crypto remains
 * required so its service reaches the persistence lazy construction environment. */
export const makeAuthPersistence = ({
  auth,
}: {
  readonly auth: ReturnType<typeof makeAppAuth>;
}) => {
  const Persistence = AuthPersistence.make(auth);
  const authStorage = Persistence.map({
    subjects: {
      table: subjects,
      id: 'id',
      status: 'active',
      activeValue: true,
      securityRevision: 'securityRevision',
      idCodec: AuthSchema.SubjectId,
      requirements: () => Effect.succeed(passwordRequirement),
    },
    tables,
  });

  const migrated = SqliteMigrator.layer(YieldedAuthMigrations.options).pipe(
    Layer.provideMerge(Persistence.Config.layer(authStorage))
  );

  const provisioning = Layer.effect(
    Persistence.Provisioning,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const crypto = yield* Crypto.Crypto;
      return {
        password: Effect.fn('Auth.provisionAdmin')(
          function* ({ registration }) {
            // Runs inside the library-owned registration transaction. Inactive and
            // non-admin accounts also close setup. Only application data is written here.
            const [row] = yield* sql`
              select
                count(*) as count
              from
                accounts
            `.pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  Schema.Tuple([
                    Schema.Struct({ count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
                  ])
                )
              )
            );
            if (row.count > 0) {
              return yield* Password.PasswordUnavailable.make({});
            }
            const id = yield* crypto.randomUUIDv4;
            const revision = yield* crypto.randomUUIDv4;
            yield* sql`
              insert into
                accounts (id, active, security_revision, display_name, role)
              values
                (
                  ${id},
                  1,
                  ${revision},
                  ${registration.displayName},
                  'admin'
                )
            `;
            return AuthSchema.SubjectId.make(id);
          },
          Effect.catchTags({
            SchemaError: () => Effect.fail(Password.PasswordUnavailable.make({})),
            SqlError: () => Effect.fail(Password.PasswordUnavailable.make({})),
            PlatformError: () => Effect.fail(Password.PasswordUnavailable.make({})),
          })
        ),
      } satisfies typeof Persistence.Provisioning.Service;
    })
  );

  return {
    Persistence,
    authStorage,
    layer: ({ filename }: { readonly filename: string }) =>
      Persistence.layer.pipe(
        Layer.provideMerge(provisioning),
        Layer.provideMerge(migrated),
        Layer.provideMerge(
          TursoClient.layer({
            filename,
            onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
          })
        )
      ),
  };
};
