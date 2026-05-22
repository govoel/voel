import { SqliteClient } from '@effect/sql-sqlite-react-native';
import { Cause, Effect, Layer, Schema, SchemaIssue } from 'effect';
import { Migrator, SqlClient, SqlError } from 'effect/unstable/sql';

import { AppConfig } from '#src/services/config.ts';
import { baseTables } from '#src/services/database/migrations/000001-base-tables.ts';

const runMigrations = Migrator.make({});

export const DatabaseLive = Layer.provideMerge(
  Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA journal_mode = WAL`;
      yield* sql`PRAGMA foreign_keys = ON`;
      yield* sql`PRAGMA synchronous = NORMAL`;

      yield* runMigrations({
        loader: Migrator.fromRecord({
          '000001_baseTables': baseTables,
        }),
      }).pipe(
        Effect.tap((results) =>
          results.length === 0
            ? Effect.void
            : Effect.logInfo('Client database migrations ran successfully', { results })
        ),
        Effect.tapError((error) => Effect.logError('Client database migrations failed', { error }))
      );
    })
  ),
  Effect.service(AppConfig).pipe(
    Effect.map((config) => SqliteClient.layer({ filename: config.db.filename })),
    Layer.unwrap
  )
);

export class ClientDatabaseDecodeError extends Schema.TaggedErrorClass<ClientDatabaseDecodeError>()(
  'voel/services/database/ClientDatabaseDecodeError',
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class ClientDatabaseNoSuchElementError extends Schema.TaggedErrorClass<ClientDatabaseNoSuchElementError>()(
  'voel/services/database/ClientDatabaseNoSuchElementError',
  {
    operation: Schema.String,
  }
) {}

export class ClientDatabaseSqlError extends Schema.TaggedErrorClass<ClientDatabaseSqlError>()(
  'voel/services/database/ClientDatabaseSqlError',
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: SqlError.SqlError,
  }
) {}

export const ClientDatabaseError = Schema.Union(
  [ClientDatabaseDecodeError, ClientDatabaseSqlError],
  { mode: 'oneOf' }
);

const defaultFormatter = SchemaIssue.makeFormatterDefault();

type ToDatabaseError<E> = E extends Schema.SchemaError
  ? ClientDatabaseDecodeError
  : E extends SqlError.SqlError
    ? ClientDatabaseSqlError
    : E extends Cause.NoSuchElementError
      ? ClientDatabaseNoSuchElementError
      : E;

type ToDatabaseErrorUnion<E> = [E] extends [never] ? never : ToDatabaseError<E>;

type ToDatabaseErrorWide<E> =
  | E
  | ClientDatabaseDecodeError
  | ClientDatabaseSqlError
  | ClientDatabaseNoSuchElementError;

const mapDatabaseError = <E>(operation: string, error: E): ToDatabaseErrorWide<E> => {
  if (Schema.isSchemaError(error)) {
    return new ClientDatabaseDecodeError({
      operation: `${operation}.schema`,
      issue: defaultFormatter(error.issue),
      cause: error,
    });
  }

  if (SqlError.isSqlError(error)) {
    return new ClientDatabaseSqlError({
      operation: `${operation}.sql`,
      issue: `Failed to execute ${operation}.sql (${error.message})`,
      cause: error,
    });
  }

  if (Cause.isNoSuchElementError(error)) {
    return new ClientDatabaseNoSuchElementError({
      operation: `${operation}.nse`,
    });
  }

  return error;
};

export function toDatabaseError(
  operation: string
): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, ToDatabaseErrorUnion<E>, R>;
export function toDatabaseError(operation: string) {
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ToDatabaseErrorWide<E>, R> =>
    effect.pipe(Effect.mapError((error) => mapDatabaseError(operation, error)));
}
