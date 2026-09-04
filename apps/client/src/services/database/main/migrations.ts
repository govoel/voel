import { Layer, Schema } from 'effect';

import { SqliteMigrator } from '@repo/effect-turso-sync-rn/migrator';

import baseTablesMigration from '#src/services/database/main/migrations/000001-base-tables.ts';

class DatabaseMigrationError extends Schema.TaggedError<
  DatabaseMigrationError,
  { readonly brand: unique symbol }
>('voel/services/database/main/migrations/DatabaseMigrationError')('DatabaseMigrationError', {
  cause: Schema.Defect(),
  database: Schema.Literal('main'),
}) {}

export const MainDatabaseMigrations = {
  layer: SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord({
      '000001_base-tables': baseTablesMigration,
    }),
  }).pipe(
    Layer.catchTag('MigrationError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'main' }))
    ),
    Layer.catchTag('SqlError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'main' }))
    )
  ),
};
