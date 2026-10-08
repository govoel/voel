import { Schema as AuthSchema, Sessions } from '@yielded/auth';
import { AuthPersistence } from '@yielded/auth-persistence';
import { layerWebCrypto } from '@yielded/crypto/WebCrypto';
import { Duration, Effect, Layer } from 'effect';

import { SqliteMigrator, TursoClient } from '@repo/effect-turso';

import { AppAuth } from '#src/services/auth/app.ts';
import storageMigration from '#src/services/auth/migrations/000001-storage.ts';
import { AuthTables } from '#src/services/auth/tables.ts';

export const Persistence = AuthPersistence.make(AppAuth);

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

export const authStorage = Persistence.map({
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

export const YieldedAuthMigrations = {
  options: {
    loader: SqliteMigrator.fromRecord({ '000001_storage': storageMigration }),
  },
};

const migrated = SqliteMigrator.layer(YieldedAuthMigrations.options).pipe(
  Layer.provideMerge(Persistence.Config.layer(authStorage))
);

/** Storage only: no AccountMethods, transport, or changes to Better Auth runtime.
 * Use a fresh private auth database, never a synced library database. Every physical
 * connection enables FK enforcement before entering the Turso pool. */
export const YieldedAuthPersistence = {
  layer: ({ filename }: { readonly filename: string }) =>
    Persistence.layer.pipe(
      Layer.provideMerge(layerWebCrypto),
      Layer.provideMerge(migrated),
      Layer.provideMerge(
        TursoClient.layer({
          filename,
          onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
        })
      )
    ),
};
