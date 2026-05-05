import { Cause, Effect, Schema, SchemaIssue } from 'effect';
import { SqlError } from 'effect/unstable/sql';

export class DatabaseDecodeError extends Schema.TaggedErrorClass<DatabaseDecodeError>()(
  '@repo/spec-api/database/DatabaseDecodeError',
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class DatabaseSqlError extends Schema.TaggedErrorClass<DatabaseSqlError>()(
  '@repo/spec-api/database/DatabaseSqlError',
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: SqlError.SqlError,
  }
) {}

export const DatabaseError = Schema.Union([DatabaseDecodeError, DatabaseSqlError], {
  mode: 'oneOf',
});

const defaultFormatter = SchemaIssue.makeFormatterDefault();

export const toDatabaseDecodeOrSqlError =
  <A, E, R>(operation: string) =>
  (
    effect: Effect.Effect<
      A,
      E | Cause.NoSuchElementError | Schema.SchemaError | SqlError.SqlError,
      R
    >
  ) =>
    effect.pipe(
      Effect.mapError((error) => {
        if (Schema.isSchemaError(error)) {
          return new DatabaseDecodeError({
            operation: `${operation}.schema`,
            issue: defaultFormatter(error.issue),
            cause: error,
          });
        }
        if (SqlError.isSqlError(error)) {
          return new DatabaseSqlError({
            operation: `${operation}.sql`,
            issue: `Failed to execute ${operation}.sql (${error.message})`,
            cause: error,
          });
        }
        if (Cause.isNoSuchElementError(error)) {
          return new DatabaseDecodeError({
            operation: `${operation}.nse`,
            issue: 'Database returned no rows when at least one was expected',
            cause: error,
          });
        }
        return error;
      })
    );
