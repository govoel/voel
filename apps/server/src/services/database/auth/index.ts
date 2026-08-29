import { Database as TursoCompatDatabase } from '@govoel/turso-database/compat';
import { Context, Effect, Layer, Schema } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';

import { TursoClient } from '@repo/effect-turso';

import { ApiConfig } from '#src/services/config.ts';
import { AuthMigrations } from '#src/services/database/auth/migrations.ts';

class DatabaseInitializationError extends Schema.TaggedError<
  DatabaseInitializationError,
  { readonly brand: unique symbol }
>('@repo/server/services/database/auth/DatabaseInitializationError')(
  'DatabaseInitializationError',
  {
    cause: Schema.Defect(),
    database: Schema.Literal('auth'),
  }
) {}

/** Better Auth's private, non-synced Turso database. */
export class AuthDatabase extends Context.Service<AuthDatabase>()(
  '@repo/server/services/database/auth/AuthDatabase',
  {
    make: Effect.fnUntraced(function* ({ filename }: { filename: string }) {
      if (filename === ':memory:') {
        return yield* DatabaseInitializationError.make({
          cause: new Error('AuthDatabase requires a file-backed database'),
          database: 'auth',
        });
      }

      const database = yield* Effect.acquireRelease(
        Effect.try({
          try: () => new TursoCompatDatabase(filename, { timeout: 5000 }),
          catch: (cause) => DatabaseInitializationError.make({ cause, database: 'auth' }),
        }),
        (db) =>
          Effect.ignore(
            Effect.sync(() => {
              db.close();
            })
          )
      );

      yield* Effect.try({
        try: () => {
          database.exec('PRAGMA foreign_keys = ON');
        },
        catch: (cause) => DatabaseInitializationError.make({ cause, database: 'auth' }),
      });

      // Better Auth mistakes DatabaseCompat's public `db` property for its
      // `{ db: Kysely }` configuration form, so expose only Kysely's SQLite
      // driver surface plus the method Better Auth uses for dialect detection.
      return {
        aggregate: database.aggregate.bind(database),
        prepare: database.prepare.bind(database),
        close: database.close.bind(database),
      };
    }),
  }
) {
  public static readonly layerNoDeps = AuthMigrations.layer.pipe(
    Layer.provideMerge(
      Layer.effect(
        this,
        Effect.service(ApiConfig).pipe(
          Effect.flatMap((config) => this.make({ filename: config.db.authFilename }))
        )
      )
    ),
    Layer.provide(
      Layer.effect(
        SqlClient.SqlClient,
        Effect.service(ApiConfig).pipe(
          Effect.flatMap((config) => TursoClient.make({ filename: config.db.authFilename })),
          Effect.catchTags({
            SqlError: (cause) => DatabaseInitializationError.make({ cause, database: 'auth' }),
            TursoConfigError: (cause) =>
              DatabaseInitializationError.make({ cause, database: 'auth' }),
          })
        )
      )
    )
  );

  public static readonly layer = AuthDatabase.layerNoDeps.pipe(
    Layer.provide([Reactivity.layer, ApiConfig.layer])
  );
}
