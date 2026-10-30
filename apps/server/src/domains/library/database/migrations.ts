import { Layer, Schema } from 'effect';
import { Migrator } from 'effect/sql';

import baseTablesMigration from '#src/domains/library/database/migrations/000001-base-tables.ts';

class DatabaseMigrationError extends Schema.TaggedError<
  DatabaseMigrationError,
  { readonly brand: unique symbol }
>('@repo/server/domains/library/database/migrations/DatabaseMigrationError')(
  'DatabaseMigrationError',
  {
    cause: Schema.Defect(),
    database: Schema.Literal('library'),
  }
) {}

export const LibraryMigrations = {
  layer: Layer.effectDiscard(
    Migrator.make({})({
      loader: Migrator.fromRecord({
        '000001_base-tables': baseTablesMigration,
      }),
    })
  ).pipe(
    Layer.catchTag('MigrationError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'library' }))
    ),
    Layer.catchTag('SqlError', (cause) =>
      Layer.effectDiscard(DatabaseMigrationError.make({ cause, database: 'library' }))
    )
  ),
};
