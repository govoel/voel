import { Context, Effect, Layer, Schema } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';

import { TursoClient } from '@repo/effect-turso';

import { ApiConfig } from '#src/services/config.ts';
import { LibraryMigrations } from '#src/services/database/library/migrations.ts';

class DatabaseInitializationError extends Schema.TaggedError<
  DatabaseInitializationError,
  { readonly brand: unique symbol }
>('@repo/server/services/database/library/DatabaseInitializationError')(
  'DatabaseInitializationError',
  {
    cause: Schema.Defect(),
    database: Schema.Literal('library'),
  }
) {}

/** The client-safe catalog database that will be exposed through Turso Sync. */
export class LibraryDatabase extends Context.Service<LibraryDatabase>()(
  '@repo/server/services/database/library/LibraryDatabase',
  {
    make: Effect.fnUntraced(function* ({ filename }: { filename: string }) {
      if (filename === ':memory:') {
        return yield* DatabaseInitializationError.make({
          cause: new Error('LibraryDatabase requires a file-backed database'),
          database: 'library',
        });
      }

      return yield* TursoClient.make({
        filename,
        onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
      }).pipe(
        Effect.catchTags({
          SqlError: (cause) => DatabaseInitializationError.make({ cause, database: 'library' }),
          TursoConfigError: (cause) =>
            DatabaseInitializationError.make({ cause, database: 'library' }),
        })
      );
    }),
  }
) {
  public static readonly layerNoDeps = LibraryMigrations.layer.pipe(
    Layer.provideMerge(
      Effect.service(ApiConfig).pipe(
        Effect.flatMap((config) => this.make({ filename: config.db.libraryFilename })),
        Effect.map((client) =>
          Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
        ),
        Layer.effectContext
      )
    )
  );

  public static readonly layer = LibraryDatabase.layerNoDeps.pipe(
    Layer.provide([ApiConfig.layer, Reactivity.layer])
  );
}
