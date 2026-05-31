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

export const DatabaseErrorReason = Schema.Union([DatabaseDecodeError, DatabaseSqlError], {
  mode: 'oneOf',
});

export const DatabaseErrorReasonWithNSE = Schema.Union(
  [DatabaseDecodeError, DatabaseSqlError, DatabaseNoSuchElementError],
  { mode: 'oneOf' }
);

export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()(
  '@repo/spec-api/database/DatabaseError',
  { reason: DatabaseErrorReason }
) {}

export class DatabaseErrorWithNSE extends Schema.TaggedErrorClass<DatabaseErrorWithNSE>()(
  '@repo/spec-api/database/DatabaseError',
  { reason: DatabaseErrorReasonWithNSE }
) {}

const defaultFormatter = SchemaIssue.makeFormatterDefault();

type DatabaseErrorWithReason<R> = Omit<DatabaseError, 'reason'> & { readonly reason: R };

type ToDatabaseErrorReason<E> = E extends Schema.SchemaError
  ? DatabaseDecodeError
  : E extends SqlError.SqlError
    ? DatabaseSqlError
    : E extends Cause.NoSuchElementError
      ? DatabaseNoSuchElementError
      : never;

type ToDatabaseError<E> = E extends
  | Schema.SchemaError
  | SqlError.SqlError
  | Cause.NoSuchElementError
  ? DatabaseErrorWithReason<ToDatabaseErrorReason<E>>
  : E;

type ToDatabaseErrorUnion<E> = [E] extends [never] ? never : ToDatabaseError<E>;

type ToDatabaseErrorWide<E> = E | DatabaseError | DatabaseErrorWithNSE;

const mapDatabaseError = <E>(operation: string, error: E): ToDatabaseErrorWide<E> => {
  if (Schema.isSchemaError(error)) {
    return new DatabaseError({
      reason: new DatabaseDecodeError({
        operation: `${operation}.schema`,
        issue: defaultFormatter(error.issue),
        cause: error,
      }),
    });
  }

  if (SqlError.isSqlError(error)) {
    return new DatabaseError({
      reason: new DatabaseSqlError({
        operation: `${operation}.sql`,
        issue: `Failed to execute ${operation}.sql (${error.message})`,
        cause: error,
      }),
    });
  }

  if (Cause.isNoSuchElementError(error)) {
    return new DatabaseErrorWithNSE({
      reason: new DatabaseNoSuchElementError({
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
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ToDatabaseErrorWide<E>, R> =>
    effect.pipe(Effect.mapError((error) => mapDatabaseError(operation, error)));
}
