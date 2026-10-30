import { Layer, Schema } from 'effect';
import { Migrator } from 'effect/sql';

import authTablesMigration from '@repo/auth-api/migrations/000001-auth-tables.ts';

class DatabaseMigrationError extends Schema.TaggedError<
  DatabaseMigrationError,
  { readonly brand: unique symbol }
>('@repo/server/domains/auth/database/migrations/DatabaseMigrationError')(
  'DatabaseMigrationError',
  {
    cause: Schema.Defect(),
    database: Schema.Literal('auth'),
  }
) {}

// Better Auth's runtime reconciliation is not ordered or versioned, so breaking
// schema changes and data transformations remain application-owned migrations.
export const AuthMigrations = {
  layer: Layer.effectDiscard(
    Migrator.make({})({
      loader: Migrator.fromRecord({
        '000001_auth-tables': authTablesMigration,
      }),
    })
  ).pipe(
    Layer.catchTag('MigrationError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'auth' }))
    ),
    Layer.catchTag('SqlError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'auth' }))
    )
  ),
};
