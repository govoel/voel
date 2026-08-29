import { Layer, Schema } from 'effect';

import { SqliteMigrator } from '@repo/effect-turso';

import baseTablesMigration from '#src/services/database/libraries/migrations/000001-base-tables.ts';

class DatabaseMigrationError extends Schema.TaggedError<
  DatabaseMigrationError,
  { readonly brand: unique symbol }
>('@repo/server/services/database/libraries/migrations/DatabaseMigrationError')(
  'DatabaseMigrationError',
  {
    cause: Schema.Defect(),
    database: Schema.Literal('libraries'),
  }
) {}

export const LibrariesMigrations = {
  layer: SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord({
      '000001_base-tables': baseTablesMigration,
    }),
  }).pipe(
    Layer.catchTag('MigrationError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'libraries' }))
    ),
    Layer.catchTag('SqlError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'libraries' }))
    )
  ),
};
