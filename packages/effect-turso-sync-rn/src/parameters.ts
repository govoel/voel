import { Effect, Schema } from 'effect';
import { SqlError } from 'effect/sql';

const decode = Schema.decodeUnknownEffect(
  Schema.mutable(
    Schema.Array(
      Schema.NullOr(Schema.Union([Schema.Finite, Schema.String, Schema.instanceOf(ArrayBuffer)]))
    )
  )
);

export const decodeBindParams = (params: ReadonlyArray<unknown>) =>
  decode(params).pipe(
    Effect.catchTag('SchemaError', (cause) =>
      SqlError.SqlError.make({
        reason: SqlError.UnknownError.make({
          cause,
          message: 'Failed to execute statement',
          operation: 'execute',
        }),
      })
    )
  );
