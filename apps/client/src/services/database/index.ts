import { Cause, Effect, Layer, Schema, SchemaIssue } from 'effect';
import { Migrator, SqlClient, SqlError } from 'effect/unstable/sql';

import { baseTables } from './migrations/000001-base-tables.ts';

const runMigrations = Migrator.make({});

export class ClientDatabaseMigrationError extends Schema.TaggedErrorClass<
  ClientDatabaseMigrationError,
  { readonly brand: unique symbol }
>()('voel/services/database/index/ClientDatabaseMigrationError', {}) {}

export const DatabaseMigrationsLive = Layer.effectDiscard(
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
  }).pipe(
    Effect.catchTags({
      SqlError: () => new ClientDatabaseMigrationError(),
      MigrationError: () => new ClientDatabaseMigrationError(),
    })
  )
);

export class ClientDatabaseDecodeError extends Schema.TaggedErrorClass<
  ClientDatabaseDecodeError,
  { readonly brand: unique symbol }
>()('voel/services/database/ClientDatabaseDecodeError', {
  operation: Schema.String,
  issue: Schema.String,
  cause: Schema.Defect(),
}) {}

export class ClientDatabaseNoSuchElementError extends Schema.TaggedErrorClass<
  ClientDatabaseNoSuchElementError,
  { readonly brand: unique symbol }
>()('voel/services/database/ClientDatabaseNoSuchElementError', {
  operation: Schema.String,
}) {}

export class ClientDatabaseSqlError extends Schema.TaggedErrorClass<
  ClientDatabaseSqlError,
  { readonly brand: unique symbol }
>()('voel/services/database/ClientDatabaseSqlError', {
  operation: Schema.String,
  issue: Schema.String,
  cause: SqlError.SqlError,
}) {}

export const ClientDatabaseErrorReason = Schema.Union(
  [ClientDatabaseDecodeError, ClientDatabaseSqlError],
  { mode: 'oneOf' }
);

export const ClientDatabaseErrorReasonWithNSE = Schema.Union(
  [ClientDatabaseDecodeError, ClientDatabaseSqlError, ClientDatabaseNoSuchElementError],
  { mode: 'oneOf' }
);

export class ClientDatabaseError extends Schema.TaggedErrorClass<
  ClientDatabaseError,
  { readonly brand: unique symbol }
>()('voel/services/database/ClientDatabaseError', {
  reason: ClientDatabaseErrorReason,
}) {}

export class ClientDatabaseErrorWithNSE extends Schema.TaggedErrorClass<
  ClientDatabaseErrorWithNSE,
  { readonly brand: unique symbol }
>()('voel/services/database/ClientDatabaseError', {
  reason: ClientDatabaseErrorReasonWithNSE,
}) {}

const defaultFormatter = SchemaIssue.makeFormatterDefault();

type ClientDatabaseErrorFor<E> =
  Extract<E, Cause.NoSuchElementError | ClientDatabaseErrorWithNSE> extends never
    ? ClientDatabaseError
    : ClientDatabaseErrorWithNSE;

type ToDatabaseError<E, Original = E> = E extends
  | Schema.SchemaError
  | SqlError.SqlError
  | Cause.NoSuchElementError
  | ClientDatabaseError
  | ClientDatabaseErrorWithNSE
  ? ClientDatabaseErrorFor<Original>
  : E;

type ToDatabaseErrorUnion<E> = [E] extends [never] ? never : ToDatabaseError<E>;

type ToDatabaseErrorWide<E> = E | ClientDatabaseError | ClientDatabaseErrorWithNSE;

const mapDatabaseError = <E>(operation: string, error: E): ToDatabaseErrorWide<E> => {
  if (Schema.isSchemaError(error)) {
    return new ClientDatabaseError({
      reason: new ClientDatabaseDecodeError({
        operation: `${operation}.schema`,
        issue: defaultFormatter(error.issue),
        cause: error,
      }),
    });
  }

  if (SqlError.isSqlError(error)) {
    return new ClientDatabaseError({
      reason: new ClientDatabaseSqlError({
        operation: `${operation}.sql`,
        issue: `Failed to execute ${operation}.sql (${error.message})`,
        cause: error,
      }),
    });
  }

  if (Cause.isNoSuchElementError(error)) {
    return new ClientDatabaseErrorWithNSE({
      reason: new ClientDatabaseNoSuchElementError({
        operation: `${operation}.nse`,
      }),
    });
  }

  return error;
};

export function toDatabaseError(
  operation: string
): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, ToDatabaseErrorUnion<E>, R>;
export function toDatabaseError(operation: string) {
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.mapError((error) => mapDatabaseError(operation, error)));
}
