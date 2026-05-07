import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient, SqlSchema } from 'effect/unstable/sql';

import { toDatabaseDecodeOrSqlError } from '@repo/spec-api/database/index.ts';
import { LibraryTable, MediaTypes } from '@repo/spec-api/database/library.ts';

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
          sql`insert into library ${sql.insert(row)} on conflict do nothing returning id, name, type`,
      });

      const insertPaths = SqlSchema.findAll({
        Request: Schema.Struct({
          libraryId: LibraryTable.fields.id,
          paths: Schema.NonEmptyArray(Schema.String),
        }),
        Result: Schema.Struct({ path: Schema.String }),
        execute: ({ libraryId, paths }) =>
          sql`insert into libraryPath ${sql.insert(paths.map((path) => ({ libraryId, path })))} returning path`,
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
            return [
              {
                id: library.id,
                name: library.name,
                type: library.type,
                paths: paths.map((p) => p.path),
              },
            ];
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
) {
  public static readonly layer = Layer.effect(this, this.make);
}
