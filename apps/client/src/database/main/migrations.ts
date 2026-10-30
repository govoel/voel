import { Layer, Schema } from 'effect';
import { Migrator } from 'effect/sql';

import baseTablesMigration from '#src/database/main/migrations/000001-base-tables.ts';

class DatabaseMigrationError extends Schema.TaggedError<
  DatabaseMigrationError,
  { readonly brand: unique symbol }
>('voel/database/main/migrations/DatabaseMigrationError')('DatabaseMigrationError', {
  cause: Schema.Defect(),
  database: Schema.Literal('main'),
}) {}

export const MainDatabaseMigrations = {
  layer: Layer.effectDiscard(
    Migrator.make({})({
      loader: Migrator.fromRecord({
        '000001_base-tables': baseTablesMigration,
      }),
    })
  ).pipe(
    Layer.catchTag('MigrationError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'main' }))
    ),
    Layer.catchTag('SqlError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'main' }))
    )
  ),
};
