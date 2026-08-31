import { Context, Effect, Layer, Schema } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';

import { TursoClient } from '@repo/effect-turso';

import { ApiConfig } from '#src/services/config.ts';
import { LibrariesMigrations } from '#src/services/database/libraries/migrations.ts';

class DatabaseInitializationError extends Schema.TaggedError<
  DatabaseInitializationError,
  { readonly brand: unique symbol }
>('@repo/server/services/database/libraries/DatabaseInitializationError')(
  'DatabaseInitializationError',
  {
    cause: Schema.Defect(),
    database: Schema.Literal('libraries'),
  }
) {}

/** The client-safe catalog database that will be exposed through Turso Sync. */
export class LibrariesDatabase extends Context.Service<LibrariesDatabase>()(
  '@repo/server/services/database/libraries/LibrariesDatabase',
  {
    make: Effect.fnUntraced(function* ({ filename }: { filename: string }) {
      if (filename === ':memory:') {
        return yield* DatabaseInitializationError.make({
          cause: new Error('LibrariesDatabase requires a file-backed database'),
          database: 'libraries',
        });
      }

      return yield* TursoClient.make({
        filename,
        disableWalAutoActions: true,
        onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
      }).pipe(
        Effect.catchTags({
          SqlError: (cause) => DatabaseInitializationError.make({ cause, database: 'libraries' }),
          TursoConfigError: (cause) =>
            DatabaseInitializationError.make({ cause, database: 'libraries' }),
        })
      );
    }),
  }
) {
  public static readonly layerNoDeps = LibrariesMigrations.layer.pipe(
    Layer.provideMerge(
      Effect.service(ApiConfig).pipe(
        Effect.flatMap((config) => this.make({ filename: config.db.librariesFilename })),
        Effect.map((client) =>
          Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
        ),
        Layer.effectContext
      )
    )
  );

  public static readonly layer = LibrariesDatabase.layerNoDeps.pipe(
    Layer.provide([ApiConfig.layer, Reactivity.layer])
  );
}
