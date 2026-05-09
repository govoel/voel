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

export const toDatabaseError =
  <A, E, R>(operation: string) =>
  (
    effect: Effect.Effect<
      A,
      E | Cause.NoSuchElementError | Schema.SchemaError | SqlError.SqlError,
      R
    >
  ) =>
    effect.pipe(
      Effect.catchIf(Schema.isSchemaError, (error) =>
        new DatabaseDecodeError({
          operation: `${operation}.schema`,
          issue: defaultFormatter(error.issue),
          cause: error,
        }).asEffect()
      ),
      Effect.catchIf(SqlError.isSqlError, (error) =>
        new DatabaseSqlError({
          operation: `${operation}.sql`,
          issue: `Failed to execute ${operation}.sql (${error.message})`,
          cause: error,
        }).asEffect()
      ),
      Effect.catchIf(Cause.isNoSuchElementError, (error) =>
        new DatabaseDecodeError({
          operation: `${operation}.nse`,
          issue: 'Database returned no rows when at least one was expected',
          cause: error,
        }).asEffect()
      )
    );
