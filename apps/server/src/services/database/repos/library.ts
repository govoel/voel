import type { Cause } from 'effect';
import { Context, Effect, Schema, SchemaIssue } from 'effect';
import { SqlClient, SqlError, SqlSchema } from 'effect/unstable/sql';

import { LibraryTable, MediaTypes } from '@repo/spec-api/library.ts';

export class DatabaseDecodeError extends Schema.TaggedErrorClass<DatabaseDecodeError>()(
  '@repo/server/services/database/repos/library/DatabaseDecodeError',
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class DatabaseSqlError extends Schema.TaggedErrorClass<DatabaseSqlError>()(
  '@repo/server/services/database/repos/library/DatabaseSqlError',
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: SqlError.SqlError,
  }
) {}

const defaultFormatter = SchemaIssue.makeFormatterDefault();

const toDatabaseDecodeOrSqlError =
  <A, E, R>(operation: string) =>
  (
    effect: Effect.Effect<
      A,
      E | Cause.NoSuchElementError | Schema.SchemaError | SqlError.SqlError,
      R
    >
  ) =>
    effect.pipe(
      Effect.catchTag('NoSuchElementError', (error) =>
        new DatabaseDecodeError({
          operation: `${operation}.nse`,
          issue: '',
          cause: error,
        }).asEffect()
      ),
      Effect.catchTag('SchemaError', (error) =>
        new DatabaseDecodeError({
          operation: `${operation}.schema`,
          issue: defaultFormatter(error.issue),
          cause: error,
        }).asEffect()
      ),
      Effect.catchTag('SqlError', (error) =>
        new DatabaseSqlError({
          operation: `${operation}.sql`,
          issue: 'Failed to execute LibraryRepository.upsert:upsert',
          cause: error,
        }).asEffect()
      )
    );

export class LibraryRepository extends Context.Service<LibraryRepository>()(
  '@repo/server/services/database/repos/library/LibraryRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const insert = SqlSchema.findOne({
        Request: Schema.Struct({
          type: MediaTypes,
          name: Schema.String,
        }),
        Result: Schema.Struct({
          id: LibraryTable.fields.id,
          name: LibraryTable.fields.name,
          type: LibraryTable.fields.type,
        }),
        execute: (row) =>
          sql`insert into library ${sql.insert(row)} on conflict do nothing returning id as "id", name as "name", type as "type"`,
      });

      const insertPaths = SqlSchema.findAll({
        Request: Schema.Struct({
          libraryId: LibraryTable.fields.id,
          paths: Schema.NonEmptyArray(Schema.String),
        }),
        Result: LibraryTable.fields.paths,
        execute: ({ libraryId, paths }) =>
          sql`insert into libraryPath ${sql.insert(paths.map((path) => ({ libraryId, path })))} returning paths as "paths"`,
      });

      const upsert = SqlSchema.findOne({
        Request: Schema.Struct({
          type: MediaTypes,
          name: Schema.String,
          paths: Schema.NonEmptyArray(Schema.String),
        }),
        Result: LibraryTable,
        execute: Effect.fn(
          function* (row) {
            const library = yield* insert({ type: row.type, name: row.name }).pipe(
              toDatabaseDecodeOrSqlError('LibraryRepository.insert')
            );
            const paths = yield* insertPaths({ libraryId: library.id, paths: row.paths }).pipe(
              toDatabaseDecodeOrSqlError('LibraryRepository.insertPaths')
            );
            return [{ id: library.id, name: library.name, type: library.type, paths }];
          },
          (effect) => effect.pipe(sql.withTransaction)
        ),
      });

      return {
        upsert: (request: Parameters<typeof upsert>['0']) =>
          upsert(request).pipe(toDatabaseDecodeOrSqlError('LibraryRepository.upsert')),
      };
    }),
  }
) {}
