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

export class DatabaseNoSuchElementError extends Schema.TaggedErrorClass<DatabaseNoSuchElementError>()(
  '@repo/spec-api/database/DatabaseNoSuchElementError',
  {
    operation: Schema.String,
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

export const DatabaseErrorWithNSE = Schema.Union(
  [DatabaseDecodeError, DatabaseSqlError, DatabaseNoSuchElementError],
  {
    mode: 'oneOf',
  }
);

const defaultFormatter = SchemaIssue.makeFormatterDefault();

type ToDatabaseError<E> = E extends Schema.SchemaError
  ? DatabaseDecodeError
  : E extends SqlError.SqlError
    ? DatabaseSqlError
    : E extends Cause.NoSuchElementError
      ? DatabaseNoSuchElementError
      : E;

type ToDatabaseErrorUnion<E> = [E] extends [never] ? never : ToDatabaseError<E>;

export const toDatabaseError =
  (operation: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ToDatabaseErrorUnion<E>, R> =>
    effect.pipe(
      Effect.mapError((error): ToDatabaseErrorUnion<E> => {
        /* oxlint-disable typescript-eslint/no-unsafe-type-assertion */
        if (Schema.isSchemaError(error)) {
          return new DatabaseDecodeError({
            operation: `${operation}.schema`,
            issue: defaultFormatter(error.issue),
            cause: error,
          }) as ToDatabaseErrorUnion<E>;
        }

        if (SqlError.isSqlError(error)) {
          return new DatabaseSqlError({
            operation: `${operation}.sql`,
            issue: `Failed to execute ${operation}.sql (${error.message})`,
            cause: error,
          }) as ToDatabaseErrorUnion<E>;
        }

        if (Cause.isNoSuchElementError(error)) {
          return new DatabaseNoSuchElementError({
            operation: `${operation}.nse`,
          }) as ToDatabaseErrorUnion<E>;
        }

        return error as ToDatabaseErrorUnion<E>;
        /* oxlint-enable typescript-eslint/no-unsafe-type-assertion */
      })
    );
